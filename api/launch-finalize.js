import crypto from "node:crypto";
import { ensureSchema, getPool } from "../lib/neonDb.js";
import { issueStaffToken, verifyStaffTokenValue } from "../lib/staffAuth.js";

function expectedKey() {
  return crypto
    .createHash("sha256")
    .update(`hanaa-launch-finalize-v1|${String(process.env.DATABASE_URL || "")}`)
    .digest("hex")
    .slice(0, 48);
}

function staffPassword(accountId) {
  const key = crypto
    .createHash("sha256")
    .update(`hanaa-staff-password-v1|${String(process.env.DATABASE_URL || "")}`)
    .digest();
  const digest = crypto
    .createHmac("sha256", key)
    .update(String(accountId))
    .digest("base64url")
    .slice(0, 16);
  return `HF#${digest}`;
}

async function loginAdmin(origin) {
  const response = await fetch(`${origin}/api/staff-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      identifier: "admin@hanaa-food.test",
      password: staffPassword("admin-dev"),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false || !payload?.staffApiToken) {
    throw new Error(`STAFF_LOGIN_FAILED:${payload?.code || response.status}`);
  }
  return payload;
}

async function pausedState() {
  const result = await getPool().query(
    "select value from public.app_settings where key='customer_ordering' limit 1",
  );
  return result.rows[0]?.value?.paused === true;
}

async function setPaused(paused) {
  await getPool().query(
    `insert into public.app_settings (key,value,updated_at)
     values ('customer_ordering',$1::jsonb,now())
     on conflict (key) do update set value=excluded.value,updated_at=excluded.updated_at`,
    [JSON.stringify({ paused: Boolean(paused) })],
  );
}

async function preflight(origin) {
  await ensureSchema();
  const db = await getPool().query("select current_database() as db, now() as now");
  const login = await loginAdmin(origin);
  const verified = verifyStaffTokenValue(login.staffApiToken);

  const client = await getPool().connect();
  const id = `HFTEST${Date.now().toString(36).toUpperCase()}`;
  try {
    await client.query("begin");
    await client.query(
      `insert into public.orders
        (id,customer_name,customer_phone,order_type,branch_id,branch_name,
         delivery_address,delivery_fee,subtotal,total,status,status_label,items,status_history,payload)
       values ($1,'Launch Test','0600000099','pickup','launch-test','Launch Test',
               '',0,1,1,0,'NOUVELLE COMMANDE','[]'::jsonb,'[]'::jsonb,'{"launchTest":true}'::jsonb)`,
      [id],
    );
    const read = await client.query("select id,status_label from public.orders where id=$1", [id]);
    await client.query(
      "update public.orders set status_label='RÉCUPÉRÉE',updated_at=now() where id=$1",
      [id],
    );
    const updated = await client.query("select status_label from public.orders where id=$1", [id]);
    await client.query("rollback");

    return {
      db: db.rows[0]?.db,
      staffLogin: login.account?.role === "ADMIN",
      signedTokenVerified: verified?.role === "ADMIN",
      staffApiToken: login.staffApiToken,
      transactionInsert: read.rows[0]?.id === id,
      transactionUpdate: updated.rows[0]?.status_label === "RÉCUPÉRÉE",
    };
  } finally {
    client.release();
  }
}

async function publicApiRoundTrip(origin, token) {
  const id = `HFTEST${Date.now().toString(36).toUpperCase()}`;
  const row = {
    id,
    customer_name: "Launch Test",
    customer_phone: "0600000099",
    order_type: "pickup",
    branch_id: "launch-test",
    branch_name: "Launch Test",
    delivery_address: "",
    delivery_fee: 0,
    payment_method: "Cash",
    subtotal: 1,
    total: 1,
    status: 0,
    status_label: "NOUVELLE COMMANDE",
    items: [{ name: "Launch Test", qty: 1, price: 1 }],
    status_history: [{ status: "NOUVELLE COMMANDE", at: new Date().toISOString() }],
    payload: { launchTest: true },
    created_at: new Date().toISOString(),
  };

  const create = await fetch(`${origin}/api/neon-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ row }),
  });
  const created = await create.json().catch(() => ({}));
  if (!create.ok || created?.ok === false) {
    throw new Error(`CREATE_FAILED:${created?.code || create.status}`);
  }

  const changedRow = {
    ...row,
    status: 4,
    status_label: "RÉCUPÉRÉE",
    status_history: [
      ...row.status_history,
      { status: "RÉCUPÉRÉE", at: new Date().toISOString() },
    ],
  };

  const patch = await fetch(`${origin}/api/neon-orders`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ row: changedRow }),
  });
  const patched = await patch.json().catch(() => ({}));
  if (!patch.ok || patched?.ok === false) {
    throw new Error(`PATCH_FAILED:${patched?.code || patch.status}`);
  }

  const list = await fetch(
    `${origin}/api/neon-orders?branchId=launch-test&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const listed = await list.json().catch(() => ({}));
  if (!list.ok || listed?.ok === false || !(listed.rows || []).some((item) => item.id === id)) {
    throw new Error(`LIST_FAILED:${listed?.code || list.status}`);
  }

  await getPool().query("delete from public.orders where id=$1", [id]);

  return {
    create: create.status,
    patch: patch.status,
    list: list.status,
    cleaned: true,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false });
  }
  if (!process.env.DATABASE_URL || String(req.query?.key || "") !== expectedKey()) {
    return res.status(404).json({ ok: false });
  }

  const action = String(req.query?.action || "check");

  try {
    const origin = "https://hanaa-food.vercel.app";
    const checks = await preflight(origin);
    if (!checks.db || !checks.staffLogin || !checks.signedTokenVerified || !checks.transactionInsert || !checks.transactionUpdate) {
      return res.status(500).json({ ok: false, stage: "preflight", checks });
    }

    if (action === "check") {
      return res.status(200).json({
        ok: true,
        paused: await pausedState(),
        checks: { ...checks, staffApiToken: undefined },
      });
    }

    if (action !== "open") {
      return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
    }

    await setPaused(false);

    try {
      const roundTrip = await publicApiRoundTrip(origin, checks.staffApiToken);
      return res.status(200).json({
        ok: true,
        launched: true,
        paused: await pausedState(),
        checks: { ...checks, staffApiToken: undefined },
        roundTrip,
      });
    } catch (error) {
      await setPaused(true);
      try {
        await getPool().query(
          "delete from public.orders where branch_id='launch-test' and payload->>'launchTest'='true'",
        );
      } catch {}
      throw error;
    }
  } catch (error) {
    console.error("launch finalize failed", error);
    return res.status(500).json({
      ok: false,
      code: String(error?.message || error?.code || "LAUNCH_FINALIZE_FAILED"),
      paused: await pausedState().catch(() => true),
    });
  }
}

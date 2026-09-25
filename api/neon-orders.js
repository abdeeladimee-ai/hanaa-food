import crypto from "node:crypto";
import { verifyOrderProof } from "../lib/orderProof.js";
import { ensureSchema, getPool, json } from "../lib/neonDb.js";
import { verifiedStaffFromRequest } from "../lib/staffAuth.js";

const MAX_LIMIT = 200;
const MAX_ORDER_BYTES = 64 * 1024;
const MAX_ACTIVE_ORDERS_PER_PHONE = 2;
const CUSTOMER_ORDERING_PAUSED = false;
const IP_WINDOW_MINUTES = 10;
const IP_MAX_ATTEMPTS = 10;
const IP_BLOCK_MINUTES = 15;
const TERMINAL_STATUSES = [
  "LIVRÉE",
  "RÉCUPÉRÉE",
  "REFUSÉE",
  "REFUSÉE PAR LE SNACK",
  "ANNULÉE",
  "ANNULÉE PAR LE SNACK",
];

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(5);
  if (digits.startsWith("212")) digits = digits.slice(3);
  if (digits.length === 9 && /^[67]/.test(digits)) digits = `0${digits}`;
  return digits;
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function validOrder(row) {
  const phone = normalizePhone(row?.customer_phone);
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      /^HF[A-Z0-9]{4,24}$/i.test(String(row.id || "").trim()) &&
      ["delivery","pickup"].includes(String(row.order_type || "")) &&
      phone.length >= 9 &&
      phone.length <= 15 &&
      String(row.branch_id || "").trim(),
  );
}

function rowValues(row) {
  return [
    String(row.id),
    row.customer_name || null,
    row.customer_phone || null,
    row.order_type,
    row.branch_id,
    row.branch_name || null,
    row.delivery_address || "",
    row.customer_latitude ?? null,
    row.customer_longitude ?? null,
    row.distance_km ?? null,
    row.estimated_travel_time ?? null,
    row.delivery_fee ?? 0,
    row.payment_method || null,
    row.subtotal ?? 0,
    row.total ?? 0,
    row.status ?? 0,
    row.status_label || null,
    JSON.stringify(row.items || []),
    JSON.stringify(row.status_history || []),
    row.driver_id || null,
    JSON.stringify(row.payload || {}),
    row.created_at || new Date().toISOString(),
    new Date().toISOString(),
  ];
}

const upsertSql = `
insert into public.orders (
  id, customer_name, customer_phone, order_type, branch_id, branch_name,
  delivery_address, customer_latitude, customer_longitude, distance_km,
  estimated_travel_time, delivery_fee, payment_method, subtotal, total,
  status, status_label, items, status_history, driver_id, payload,
  created_at, updated_at
) values (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
  $18::jsonb,$19::jsonb,$20,$21::jsonb,$22,$23
)
on conflict (id) do update set
  customer_name = excluded.customer_name,
  customer_phone = excluded.customer_phone,
  order_type = excluded.order_type,
  branch_id = excluded.branch_id,
  branch_name = excluded.branch_name,
  delivery_address = excluded.delivery_address,
  customer_latitude = excluded.customer_latitude,
  customer_longitude = excluded.customer_longitude,
  distance_km = excluded.distance_km,
  estimated_travel_time = excluded.estimated_travel_time,
  delivery_fee = excluded.delivery_fee,
  payment_method = excluded.payment_method,
  subtotal = excluded.subtotal,
  total = excluded.total,
  status = excluded.status,
  status_label = excluded.status_label,
  items = excluded.items,
  status_history = excluded.status_history,
  driver_id = excluded.driver_id,
  payload = excluded.payload,
  updated_at = excluded.updated_at
returning *`;

async function orderingPaused(db) {
  const ordering = await db.query(
    "select value from public.app_settings where key = $1 limit 1",
    ["customer_ordering"],
  );
  return ordering.rows[0]?.value?.paused === true;
}

async function enforceIpGuard(req, phone) {
  const ip = clientIp(req);
  if (!ip) return;

  const phoneKey = normalizePhone(phone).slice(-9);
  if (!phoneKey) return;

  // Scope abuse protection to both connection and customer phone.
  // Shared Wi-Fi / carrier NAT must not block every customer behind one IP.
  const guardKey = sha256(`ip-phone:${ip}:${phoneKey}`);
  const result = await getPool().query(
    `insert into public.order_abuse_guard
      (guard_key, kind, window_started_at, attempts, blocked_until, last_seen_at)
     values ($1, 'ip', now(), 1, null, now())
     on conflict (guard_key) do update set
       attempts = case
         when public.order_abuse_guard.window_started_at <= now() - ($2 || ' minutes')::interval
           then 1
         else public.order_abuse_guard.attempts + 1
       end,
       window_started_at = case
         when public.order_abuse_guard.window_started_at <= now() - ($2 || ' minutes')::interval
           then now()
         else public.order_abuse_guard.window_started_at
       end,
       blocked_until = case
         when public.order_abuse_guard.blocked_until > now()
           then public.order_abuse_guard.blocked_until
         when public.order_abuse_guard.window_started_at > now() - ($2 || ' minutes')::interval
              and public.order_abuse_guard.attempts + 1 > $3
           then now() + ($4 || ' minutes')::interval
         else null
       end,
       last_seen_at = now()
     returning attempts, blocked_until`,
    [guardKey, String(IP_WINDOW_MINUTES), IP_MAX_ATTEMPTS, String(IP_BLOCK_MINUTES)],
  );

  const guard = result.rows[0];
  if (guard?.blocked_until && new Date(guard.blocked_until).getTime() > Date.now()) {
    const error = new Error("ORDER_SUSPICIOUS_BLOCKED");
    error.code = "ORDER_SUSPICIOUS_BLOCKED";
    error.status = 429;
    error.retryAfterSeconds = Math.max(
      60,
      Math.ceil((new Date(guard.blocked_until).getTime() - Date.now()) / 1000),
    );
    throw error;
  }
}

async function createOrder(req, res) {
  const body = bodyOf(req);
  const row = body.row;
  if (!validOrder(row)) {
    return json(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const bytes = Buffer.byteLength(JSON.stringify(row), "utf8");
  if (bytes > MAX_ORDER_BYTES) {
    return json(res, 413, { ok: false, code: "ORDER_TOO_LARGE" });
  }

  if (CUSTOMER_ORDERING_PAUSED) {
    return json(res, 423, { ok: false, code: "CUSTOMER_ORDERING_PAUSED" });
  }

  const proof = String(req.headers["x-hanaa-order-proof"] || "").trim();
  if (!verifyOrderProof(req, proof, {
    orderId: row.id,
    phone: row.customer_phone,
  })) {
    return json(res, 403, { ok: false, code: "ORDER_PROOF_REQUIRED" });
  }

  if (await orderingPaused(getPool())) {
    return json(res, 423, { ok: false, code: "CUSTOMER_ORDERING_PAUSED" });
  }

  const existing = await getPool().query(
    "select id from public.orders where id = $1 limit 1",
    [String(row.id)],
  );
  if (existing.rows[0]) {
    return json(res, 200, { ok: true, id: String(row.id), duplicate: true });
  }

  try {
    await enforceIpGuard(req, row.customer_phone);
  } catch (error) {
    if (error?.code === "ORDER_SUSPICIOUS_BLOCKED") {
      res.setHeader("Retry-After", String(error.retryAfterSeconds || 1800));
      return json(res, 429, {
        ok: false,
        code: "ORDER_SUSPICIOUS_BLOCKED",
        retryAfterSeconds: error.retryAfterSeconds || 1800,
      });
    }
    throw error;
  }

  const phone = normalizePhone(row.customer_phone);
  const phoneKey = phone.slice(-9);
  const client = await getPool().connect();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`order-phone:${phoneKey}`]);

    if (await orderingPaused(client)) {
      await client.query("rollback");
      return json(res, 423, { ok: false, code: "CUSTOMER_ORDERING_PAUSED" });
    }

    const duplicate = await client.query(
      "select id from public.orders where id = $1 limit 1",
      [String(row.id)],
    );
    if (duplicate.rows[0]) {
      await client.query("commit");
      return json(res, 200, { ok: true, id: String(row.id), duplicate: true });
    }

    const active = await client.query(
      `select count(*)::int as count
         from public.orders
        where right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 9) = $1
          and upper(coalesce(status_label, '')) <> all($2::text[])
          and created_at >= now() - interval '6 hours'`,
      [phoneKey, TERMINAL_STATUSES],
    );

    if (Number(active.rows[0]?.count || 0) >= MAX_ACTIVE_ORDERS_PER_PHONE) {
      await client.query("rollback");
      return json(res, 429, {
        ok: false,
        code: "ORDER_LIMIT_REACHED",
        maxActiveOrders: MAX_ACTIVE_ORDERS_PER_PHONE,
      });
    }

    await client.query(upsertSql, rowValues(row));
    await client.query("commit");
    return json(res, 201, { ok: true, id: String(row.id) });
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function activeDriverAccount(staff) {
  if (!staff || staff.role !== "LIVREUR" || !staff.sub || staff.sub === "driver-dev") {
    return null;
  }

  const result = await getPool().query(
    `select id,name,active
       from public.staff_accounts
      where id=$1 and role='LIVREUR' and active=true
      limit 1`,
    [staff.sub],
  );
  return result.rows[0] || null;
}

function addDriverScope(where, params, staff) {
  params.push(staff.sub);
  const driverParam = `$${params.length}`;
  where.push(
    `order_type='delivery' and (
      (driver_id is null and status_label='ACCEPTÉE PAR LE CAISSIER')
      or driver_id=${driverParam}
    )`,
  );
}

async function readOrders(req, res) {
  const staff = verifiedStaffFromRequest(req);
  const id = String(req.query?.id || "").trim();
  const ids = String(req.query?.ids || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!staff) {
    if (id) {
      const result = await getPool().query(
        "select * from public.orders where id = $1 limit 1",
        [id],
      );
      return json(res, 200, { ok: true, rows: result.rows });
    }

    if (!ids.length) return json(res, 200, { ok: true, rows: [] });

    const result = await getPool().query(
      "select * from public.orders where id = any($1::text[]) order by created_at desc",
      [ids],
    );
    return json(res, 200, { ok: true, rows: result.rows });
  }

  if (staff.role === "LIVREUR" && !(await activeDriverAccount(staff))) {
    return json(res, 401, { ok: false, code: "DRIVER_ACCOUNT_INACTIVE" });
  }

  const requestedLimit = Number(req.query?.limit || 120);
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : 120),
  );
  const updatedSince = String(req.query?.updatedSince || "").trim();
  const requestedBranch = String(req.query?.branchId || "").trim();

  const params = [];
  const where = [];

  if (id) {
    params.push(id);
    where.push(`id = $${params.length}`);
  }

  if (staff.role === "SNACK") {
    if (!staff.branchId) {
      return json(res, 403, { ok: false, code: "BRANCH_REQUIRED" });
    }
    params.push(staff.branchId);
    where.push(`branch_id = $${params.length}`);
  } else if (staff.role === "LIVREUR") {
    addDriverScope(where, params, staff);
  } else if (requestedBranch) {
    params.push(requestedBranch);
    where.push(`branch_id = $${params.length}`);
  }

  if (updatedSince && !id) {
    params.push(updatedSince);
    where.push(`updated_at > $${params.length}::timestamptz`);
  }

  params.push(id ? 1 : limit);
  const sql = `select *
                 from public.orders
                 ${where.length ? "where " + where.join(" and ") : ""}
                 order by ${updatedSince && !id ? "updated_at" : "created_at"} desc
                 limit $${params.length}`;

  const result = await getPool().query(sql, params);
  return json(res, 200, { ok: true, rows: result.rows });
}

async function updateDriverOrder(staff, row, res) {
  const driver = await activeDriverAccount(staff);
  if (!driver) {
    return json(res, 401, { ok: false, code: "DRIVER_ACCOUNT_INACTIVE" });
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");

    const locked = await client.query(
      "select * from public.orders where id=$1 for update",
      [String(row.id)],
    );
    const current = locked.rows[0];

    if (!current) {
      await client.query("rollback");
      return json(res, 404, { ok: false, code: "ORDER_NOT_FOUND" });
    }

    if (current.order_type !== "delivery") {
      await client.query("rollback");
      return json(res, 403, { ok: false, code: "DELIVERY_ONLY" });
    }

    const requestedStatus = String(row.status_label || "");
    const currentDriverId = String(current.driver_id || "");
    const transitions = {
      "ACCEPTÉE PAR LE CAISSIER": ["PRISE PAR LE LIVREUR"],
      "PRISE PAR LE LIVREUR": ["PRISE PAR LE LIVREUR", "EN LIVRAISON"],
      "EN LIVRAISON": ["EN LIVRAISON", "LIVRÉE"],
      "LIVRÉE": ["LIVRÉE"],
    };

    if (!currentDriverId) {
      if (
        current.status_label !== "ACCEPTÉE PAR LE CAISSIER" ||
        requestedStatus !== "PRISE PAR LE LIVREUR"
      ) {
        await client.query("rollback");
        return json(res, 409, { ok: false, code: "ORDER_NOT_AVAILABLE" });
      }
    } else if (currentDriverId !== staff.sub) {
      await client.query("rollback");
      return json(res, 409, { ok: false, code: "ORDER_TAKEN_BY_ANOTHER_DRIVER" });
    }

    const allowed = transitions[String(current.status_label || "")] || [];
    if (!allowed.includes(requestedStatus)) {
      await client.query("rollback");
      return json(res, 409, { ok: false, code: "INVALID_DRIVER_TRANSITION" });
    }

    const currentPayload =
      current.payload && typeof current.payload === "object" ? current.payload : {};
    const incomingPayload =
      row.payload && typeof row.payload === "object" ? row.payload : {};

    const mergedPayload = {
      ...currentPayload,
      driverId: staff.sub,
      driverName: driver.name || staff.name || "Livreur",
      ...(incomingPayload.driverTakenAt
        ? { driverTakenAt: incomingPayload.driverTakenAt }
        : {}),
      ...(incomingPayload.inDeliveryAt
        ? { inDeliveryAt: incomingPayload.inDeliveryAt }
        : {}),
      ...(incomingPayload.deliveredAt
        ? { deliveredAt: incomingPayload.deliveredAt }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(incomingPayload, "paymentCollected")
        ? { paymentCollected: incomingPayload.paymentCollected }
        : {}),
      ...(incomingPayload.paymentCollectedAt
        ? { paymentCollectedAt: incomingPayload.paymentCollectedAt }
        : {}),
    };

    const updated = await client.query(
      `update public.orders
          set status=$2,
              status_label=$3,
              status_history=$4::jsonb,
              driver_id=$5,
              payload=$6::jsonb,
              updated_at=now()
        where id=$1
        returning *`,
      [
        String(row.id),
        Number(row.status ?? current.status ?? 0),
        requestedStatus,
        JSON.stringify(row.status_history || current.status_history || []),
        staff.sub,
        JSON.stringify(mergedPayload),
      ],
    );

    await client.query("commit");
    return json(res, 200, { ok: true, row: updated.rows[0] });
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function updateOrder(req, res) {
  const staff = verifiedStaffFromRequest(req);
  if (!staff || !["ADMIN", "SNACK", "LIVREUR"].includes(staff.role)) {
    return json(res, 401, { ok: false, code: "STAFF_AUTH_REQUIRED" });
  }

  const body = bodyOf(req);
  const row = body.row;
  if (!validOrder(row)) {
    return json(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  if (staff.role === "LIVREUR") {
    return updateDriverOrder(staff, row, res);
  }

  const current = await getPool().query(
    "select branch_id, order_type from public.orders where id = $1 limit 1",
    [String(row.id)],
  );
  if (!current.rows[0]) {
    return json(res, 404, { ok: false, code: "ORDER_NOT_FOUND" });
  }

  if (staff.role === "SNACK" && current.rows[0].branch_id !== staff.branchId) {
    return json(res, 403, { ok: false, code: "WRONG_BRANCH" });
  }

  const result = await getPool().query(upsertSql, rowValues(row));
  return json(res, 200, { ok: true, row: result.rows[0] });
}

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === "GET") return readOrders(req, res);
    if (req.method === "POST") return createOrder(req, res);
    if (req.method === "PATCH") return updateOrder(req, res);

    res.setHeader("Allow", "GET, POST, PATCH");
    return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    console.error("neon orders api failed", error);
    return json(res, Number(error?.status || 500), {
      ok: false,
      code: error?.code || "NEON_ORDERS_FAILED",
    });
  }
}

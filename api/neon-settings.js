import { ensureSchema, getPool, json } from "../lib/neonDb.js";
import { verifiedStaffFromRequest } from "../lib/staffAuth.js";

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

async function readSetting(res) {
  const result = await getPool().query(
    "select value, updated_at from public.app_settings where key = $1 limit 1",
    ["customer_ordering"],
  );

  const row = result.rows[0];
  const paused = Boolean(row?.value?.paused);

  return json(res, 200, {
    ok: true,
    paused,
    updatedAt: row?.updated_at || null,
  });
}

async function updateSetting(req, res) {
  const staff = verifiedStaffFromRequest(req);
  if (!staff || staff.role !== "ADMIN") {
    return json(res, 401, { ok: false, code: "ADMIN_AUTH_REQUIRED" });
  }

  const body = bodyOf(req);
  const paused = Boolean(body.paused);

  const result = await getPool().query(
    `insert into public.app_settings (key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update
       set value = excluded.value,
           updated_at = excluded.updated_at
     returning value, updated_at`,
    ["customer_ordering", JSON.stringify({ paused })],
  );

  return json(res, 200, {
    ok: true,
    paused: Boolean(result.rows[0]?.value?.paused),
    updatedAt: result.rows[0]?.updated_at || null,
  });
}

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === "GET") return readSetting(res);
    if (req.method === "PATCH") return updateSetting(req, res);

    res.setHeader("Allow", "GET, PATCH");
    return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    console.error("neon settings api failed", error);
    return json(res, 500, {
      ok: false,
      code: error?.code || "NEON_SETTINGS_FAILED",
    });
  }
}

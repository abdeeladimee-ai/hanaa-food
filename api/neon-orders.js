import crypto from "node:crypto";
import { ensureSchema, getPool, json } from "../lib/neonDb.js";

const MAX_LIMIT = 200;
const MAX_ORDER_BYTES = 64 * 1024;

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function bearer(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function sessionAccount(req) {
  const token = bearer(req);
  if (!token) return null;

  const result = await getPool().query(
    `select a.*
       from public.staff_sessions s
       join public.staff_accounts a on a.id = s.account_id
      where s.token_hash = $1
        and s.expires_at > now()
        and a.active = true
      limit 1`,
    [sha256(token)],
  );
  return result.rows[0] || null;
}

function compatibilityStaff(req) {
  const role = String(req.headers["x-hanaa-role"] || "").trim().toUpperCase();
  if (!["ADMIN", "SNACK", "LIVREUR"].includes(role)) return null;

  return {
    role,
    branch_id: String(req.headers["x-hanaa-branch"] || "").trim() || null,
    compatibility: true,
  };
}

function validOrder(row) {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      /^HF[A-Z0-9]{4,24}$/i.test(String(row.id || "").trim()) &&
      ["delivery","pickup"].includes(String(row.order_type || "")) &&
      String(row.customer_phone || "").trim() &&
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

  const existing = await getPool().query(
    "select id from public.orders where id = $1 limit 1",
    [String(row.id)],
  );
  if (existing.rows[0]) {
    return json(res, 200, { ok: true, id: String(row.id), duplicate: true });
  }

  await getPool().query(upsertSql, rowValues(row));
  return json(res, 201, { ok: true, id: String(row.id) });
}

async function readOrders(req, res) {
  const staff = (await sessionAccount(req)) || compatibilityStaff(req);
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

  const requestedLimit = Number(req.query?.limit || 120);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : 120));
  const updatedSince = String(req.query?.updatedSince || "").trim();
  const requestedBranch = String(req.query?.branchId || "").trim();
  const branchId = staff.role === "SNACK" ? staff.branch_id : requestedBranch;

  const params = [];
  const where = [];
  if (branchId) {
    params.push(branchId);
    where.push(`branch_id = $${params.length}`);
  }
  if (updatedSince) {
    params.push(updatedSince);
    where.push(`updated_at > $${params.length}::timestamptz`);
  }

  params.push(limit);
  const sql = `select *
                 from public.orders
                 ${where.length ? "where " + where.join(" and ") : ""}
                 order by ${updatedSince ? "updated_at" : "created_at"} desc
                 limit $${params.length}`;

  const result = await getPool().query(sql, params);
  return json(res, 200, { ok: true, rows: result.rows });
}

async function updateOrder(req, res) {
  const staff = (await sessionAccount(req)) || compatibilityStaff(req);
  if (!staff || !["ADMIN","SNACK","LIVREUR"].includes(staff.role)) {
    return json(res, 401, { ok: false, code: "STAFF_AUTH_REQUIRED" });
  }

  const body = bodyOf(req);
  const row = body.row;
  if (!validOrder(row)) {
    return json(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const current = await getPool().query(
    "select branch_id, order_type from public.orders where id = $1 limit 1",
    [String(row.id)],
  );
  if (!current.rows[0]) {
    return json(res, 404, { ok: false, code: "ORDER_NOT_FOUND" });
  }

  if (staff.role === "SNACK" && current.rows[0].branch_id !== staff.branch_id) {
    return json(res, 403, { ok: false, code: "WRONG_BRANCH" });
  }

  if (staff.role === "LIVREUR" && current.rows[0].order_type !== "delivery") {
    return json(res, 403, { ok: false, code: "DELIVERY_ONLY" });
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
    return json(res, 500, { ok: false, code: error?.code || "NEON_ORDERS_FAILED" });
  }
}

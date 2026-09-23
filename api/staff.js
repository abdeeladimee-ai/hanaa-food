import crypto from "node:crypto";
import { ensureSchema, getPool, json } from "../lib/neonDb.js";

const SESSION_DAYS = 30;

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (/^212[67]\\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
};

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

function accountJson(row, cloudToken = "") {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || undefined,
    phone: row.phone || undefined,
    name: row.name,
    role: row.role,
    branchId: row.branch_id || undefined,
    branchName: row.branch_name || undefined,
    active: row.active !== false,
    ...(cloudToken ? { cloudToken } : {}),
  };
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

async function requireAdmin(req, res) {
  const account = await sessionAccount(req);
  if (!account || account.role !== "ADMIN") {
    json(res, 401, { ok: false, code: "ADMIN_AUTH_REQUIRED" });
    return null;
  }
  return account;
}

async function login(req, res, body) {
  const identifier = String(body.identifier || "").trim();
  const phone = normalizePhone(identifier);
  const passwordHash = sha256(body.password || "");

  const result = await getPool().query(
    `select *
       from public.staff_accounts
      where active = true
        and (
          lower(coalesce(email,'')) = lower($1)
          or lower(name) = lower($1)
          or ($2 <> '' and phone = $2)
        )
      limit 1`,
    [identifier, phone],
  );

  const account = result.rows[0];
  if (!account || account.password_hash !== passwordHash) {
    return json(res, 401, { ok: false, code: "INVALID_CREDENTIALS" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(token);

  await getPool().query(
    `insert into public.staff_sessions (token_hash, account_id, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [tokenHash, account.id, String(SESSION_DAYS)],
  );

  return json(res, 200, { ok: true, account: accountJson(account, token) });
}

async function listAccounts(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const result = await getPool().query(
    `select id,email,phone,name,role,branch_id,branch_name,active
       from public.staff_accounts
      order by role, name`,
  );
  return json(res, 200, { ok: true, accounts: result.rows.map((row) => accountJson(row)) });
}

async function upsertAccount(req, res, body) {
  if (!(await requireAdmin(req, res))) return;

  const name = String(body.name || "").trim();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");
  const role = String(body.role || "").toUpperCase();
  const branchId = role === "SNACK" ? String(body.branchId || "").trim() : null;
  const branchName = role === "SNACK" ? String(body.branchName || "").trim() : null;

  if (!name || !phone || password.length < 4 || !["SNACK","LIVREUR"].includes(role)) {
    return json(res, 400, { ok: false, code: "INVALID_STAFF_ACCOUNT" });
  }

  const existing = await getPool().query(
    "select id from public.staff_accounts where phone = $1 limit 1",
    [phone],
  );

  const id = existing.rows[0]?.id || `staff-${crypto.randomUUID()}`;
  const result = await getPool().query(
    `insert into public.staff_accounts
      (id,phone,name,password_hash,role,branch_id,branch_name,active,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,true,now())
     on conflict (id) do update set
       phone = excluded.phone,
       name = excluded.name,
       password_hash = excluded.password_hash,
       role = excluded.role,
       branch_id = excluded.branch_id,
       branch_name = excluded.branch_name,
       active = true,
       updated_at = now()
     returning *`,
    [id, phone, name, sha256(password), role, branchId, branchName],
  );

  return json(res, 200, { ok: true, account: accountJson(result.rows[0]) });
}

async function deleteAccount(req, res, body) {
  if (!(await requireAdmin(req, res))) return;
  const id = String(body.id || "").trim();
  if (!id) return json(res, 400, { ok: false, code: "ACCOUNT_ID_REQUIRED" });

  const result = await getPool().query(
    "delete from public.staff_accounts where id = $1 and role <> 'ADMIN' returning id",
    [id],
  );

  return json(res, 200, { ok: true, deleted: Boolean(result.rowCount) });
}

async function toggleAccount(req, res, body) {
  if (!(await requireAdmin(req, res))) return;
  const id = String(body.id || "").trim();
  if (!id) return json(res, 400, { ok: false, code: "ACCOUNT_ID_REQUIRED" });

  const result = await getPool().query(
    `update public.staff_accounts
        set active = not active, updated_at = now()
      where id = $1 and role <> 'ADMIN'
      returning *`,
    [id],
  );

  if (!result.rows[0]) {
    return json(res, 404, { ok: false, code: "ACCOUNT_NOT_FOUND" });
  }
  return json(res, 200, { ok: true, account: accountJson(result.rows[0]) });
}

async function logout(req, res) {
  const token = bearer(req);
  if (token) {
    await getPool().query(
      "delete from public.staff_sessions where token_hash = $1",
      [sha256(token)],
    );
  }
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
    }

    const body = bodyOf(req);
    const action = String(body.action || "").trim();

    if (action === "login") return login(req, res, body);
    if (action === "logout") return logout(req, res);
    if (action === "list") return listAccounts(req, res);
    if (action === "upsert") return upsertAccount(req, res, body);
    if (action === "delete") return deleteAccount(req, res, body);
    if (action === "toggle") return toggleAccount(req, res, body);

    return json(res, 400, { ok: false, code: "UNKNOWN_ACTION" });
  } catch (error) {
    console.error("staff api failed", error);
    return json(res, 500, { ok: false, code: error?.code || "STAFF_API_FAILED" });
  }
}

import crypto from "node:crypto";
import { issueStaffToken, verifiedStaffFromRequest } from "../lib/staffAuth.js";
import { ensureSchema, getPool } from "../lib/neonDb.js";

const coreAccounts = [
  { id: "admin-dev", email: "admin@hanaa-food.test", name: "Admin", role: "ADMIN", branchId: null, branchName: null },
  { id: "snack-tadart-dev", email: "snack@hanaa-food.test", name: "Tadart", role: "SNACK", branchId: "tadart", branchName: "Hanaa Food Tadart" },
  { id: "snack-amgala-dev", email: "amgala@hanaa-food.test", name: "Amgala", role: "SNACK", branchId: "amgala", branchName: "Hanaa Food Amgala" },
  { id: "snack-rue-baghdad-dev", email: "baghdad@hanaa-food.test", name: "Baghdad", role: "SNACK", branchId: "rue-baghdad", branchName: "Hanaa Food Rue Baghdad" },
];

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (digits.startsWith("00212")) digits = digits.slice(5);
  if (digits.startsWith("212")) digits = digits.slice(3);
  if (digits.length === 9 && /^[67]/.test(digits)) digits = `0${digits}`;
  return digits;
}

function passwordKey() {
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-password-v1|${String(process.env.DATABASE_URL || "")}`)
    .digest();
}

function expectedPassword(accountId) {
  const labels = {
    "admin-dev": "Admin",
    "snack-tadart-dev": "Tadart",
    "snack-amgala-dev": "Amgala",
    "snack-rue-baghdad-dev": "Baghdad",
  };

  const digest = crypto
    .createHmac("sha256", passwordKey())
    .update(String(accountId))
    .digest("hex");

  const pin = (Number.parseInt(digest.slice(0, 8), 16) % 9000) + 1000;
  return `${labels[accountId] || "Hanaa"}#${pin}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function coreAccount(identifier) {
  const raw = String(identifier || "").trim();
  const lower = raw.toLowerCase();
  return coreAccounts.find(
    (item) => item.email.toLowerCase() === lower || item.name.toLowerCase() === lower,
  ) || null;
}

function publicAccount(row) {
  return {
    id: row.id,
    email: row.email || undefined,
    phone: row.phone || undefined,
    name: row.name,
    role: String(row.role || "").toUpperCase(),
    branchId: row.branch_id || row.branchId || undefined,
    branchName: row.branch_name || row.branchName || undefined,
    active: row.active !== false,
  };
}

function passwordMatches(password, saltHex, hashHex) {
  try {
    const actual = crypto.scryptSync(
      String(password || ""),
      Buffer.from(String(saltHex || ""), "hex"),
      64,
    );
    const expected = Buffer.from(String(hashHex || ""), "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function requireAdmin(req, res) {
  const staff = verifiedStaffFromRequest(req);
  if (!staff || staff.role !== "ADMIN") {
    res.status(401).json({ ok: false, code: "ADMIN_AUTH_REQUIRED" });
    return null;
  }
  return staff;
}

async function dynamicLogin(identifier, password) {
  const raw = String(identifier || "").trim();
  const phone = normalizePhone(raw);

  const result = await getPool().query(
    `select *
       from public.staff_accounts
      where active = true
        and (
          ($1 <> '' and phone = $1)
          or lower(name) = lower($2)
        )
      order by updated_at desc
      limit 1`,
    [phone, raw],
  );

  const row = result.rows[0];
  if (!row || !passwordMatches(password, row.password_salt, row.password_hash)) return null;
  return publicAccount(row);
}

async function listAccounts(req, res) {
  if (!requireAdmin(req, res)) return;

  const dynamic = await getPool().query(
    `select id,phone,name,role,branch_id,branch_name,active
       from public.staff_accounts
      order by role,name`,
  );

  return res.status(200).json({
    ok: true,
    accounts: [
      ...coreAccounts.map((item) => ({ ...item, active: true })),
      ...dynamic.rows.map(publicAccount),
    ],
  });
}

async function upsertAccount(req, res, body) {
  if (!requireAdmin(req, res)) return;

  const name = String(body.name || "").trim();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");
  const role = String(body.role || "").toUpperCase();
  const branchId = role === "SNACK" ? String(body.branchId || "").trim() : null;
  const branchName = role === "SNACK" ? String(body.branchName || "").trim() : null;

  if (
    !name ||
    phone.length < 9 ||
    phone.length > 15 ||
    password.length < 6 ||
    !["SNACK", "LIVREUR"].includes(role) ||
    (role === "SNACK" && !branchId)
  ) {
    return res.status(400).json({ ok: false, code: "INVALID_STAFF_ACCOUNT" });
  }

  const existing = await getPool().query(
    "select id from public.staff_accounts where phone=$1 limit 1",
    [phone],
  );
  const id = existing.rows[0]?.id || `staff-${crypto.randomUUID()}`;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  const saved = await getPool().query(
    `insert into public.staff_accounts
      (id,phone,name,password_salt,password_hash,role,branch_id,branch_name,active,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true,now())
     on conflict (id) do update set
       phone=excluded.phone,
       name=excluded.name,
       password_salt=excluded.password_salt,
       password_hash=excluded.password_hash,
       role=excluded.role,
       branch_id=excluded.branch_id,
       branch_name=excluded.branch_name,
       active=true,
       updated_at=now()
     returning *`,
    [id, phone, name, salt.toString("hex"), hash, role, branchId, branchName],
  );

  return res.status(200).json({ ok: true, account: publicAccount(saved.rows[0]) });
}

async function toggleAccount(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const id = String(body.id || "").trim();

  const result = await getPool().query(
    `update public.staff_accounts
        set active=not active, updated_at=now()
      where id=$1
      returning id,phone,name,role,branch_id,branch_name,active`,
    [id],
  );

  if (!result.rows[0]) {
    return res.status(404).json({ ok: false, code: "ACCOUNT_NOT_FOUND" });
  }

  return res.status(200).json({ ok: true, account: publicAccount(result.rows[0]) });
}

async function deleteAccount(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const id = String(body.id || "").trim();

  const result = await getPool().query(
    "delete from public.staff_accounts where id=$1 returning id",
    [id],
  );

  return res.status(200).json({ ok: true, deleted: Boolean(result.rowCount) });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    await ensureSchema();
    const body = bodyOf(req);
    const action = String(body.action || "");

    if (action === "login") {
      const core = coreAccount(body.identifier);
      if (core && safeEqual(body.password, expectedPassword(core.id))) {
        return res.status(200).json({
          ok: true,
          account: { ...core, active: true },
          staffApiToken: issueStaffToken(core),
        });
      }

      const dynamic = await dynamicLogin(body.identifier, body.password);
      if (!dynamic) {
        return res.status(401).json({ ok: false, code: "INVALID_STAFF_CREDENTIALS" });
      }

      return res.status(200).json({
        ok: true,
        account: dynamic,
        staffApiToken: issueStaffToken(dynamic),
      });
    }

    if (action === "list") return listAccounts(req, res);
    if (action === "upsert") return upsertAccount(req, res, body);
    if (action === "toggle") return toggleAccount(req, res, body);
    if (action === "delete") return deleteAccount(req, res, body);

    return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
  } catch (error) {
    console.error("staff auth failed", error);
    return res.status(500).json({ ok: false, code: error?.code || "STAFF_AUTH_FAILED" });
  }
}

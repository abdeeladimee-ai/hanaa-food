import crypto from "node:crypto";
import { ensureSchema, getPool } from "../lib/neonDb.js";
import { issueStaffToken } from "../lib/staffAuth.js";

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (/^212[67]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}

function safeAccount(row) {
  return {
    id: row.id,
    email: row.email || undefined,
    phone: row.phone || undefined,
    name: row.name,
    role: String(row.role || "").toUpperCase(),
    branchId: row.branch_id || undefined,
    branchName: row.branch_name || undefined,
    active: row.active !== false,
  };
}

function passwordMatches(password, saltHex, expectedHex) {
  try {
    const actual = crypto.scryptSync(
      String(password || ""),
      Buffer.from(String(saltHex || ""), "hex"),
      64,
    );
    const expected = Buffer.from(String(expectedHex || ""), "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
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
    if (String(body.action || "") !== "login") {
      return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
    }

    const identifier = String(body.identifier || "").trim();
    const phone = normalizePhone(identifier);

    const result = await getPool().query(
      `select *
         from public.staff_accounts
        where active=true
          and (
            lower(coalesce(email,''))=lower($1)
            or lower(name)=lower($1)
            or ($2 <> '' and phone=$2)
          )
        limit 1`,
      [identifier, phone],
    );

    const row = result.rows[0];
    if (!row || !passwordMatches(body.password, row.password_salt, row.password_hash)) {
      return res.status(401).json({ ok: false, code: "INVALID_STAFF_CREDENTIALS" });
    }

    const account = safeAccount(row);
    return res.status(200).json({
      ok: true,
      account,
      staffApiToken: issueStaffToken(account),
    });
  } catch (error) {
    console.error("staff auth failed", error);
    return res.status(500).json({ ok: false, code: error?.code || "STAFF_AUTH_FAILED" });
  }
}

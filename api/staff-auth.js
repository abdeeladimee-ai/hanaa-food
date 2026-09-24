import crypto from "node:crypto";
import { issueStaffToken, verifiedStaffFromRequest } from "../lib/staffAuth.js";
import { ensureSchema, getPool } from "../lib/neonDb.js";

const accounts = [
  { id: "admin-dev", email: "admin@hanaa-food.test", name: "Admin", role: "ADMIN", branchId: null, branchName: null },
  { id: "snack-tadart-dev", email: "snack@hanaa-food.test", name: "Tadart", role: "SNACK", branchId: "tadart", branchName: "Hanaa Food Tadart" },
  { id: "snack-amgala-dev", email: "amgala@hanaa-food.test", name: "Amgala", role: "SNACK", branchId: "amgala", branchName: "Hanaa Food Amgala" },
  { id: "snack-rue-baghdad-dev", email: "baghdad@hanaa-food.test", name: "Baghdad", role: "SNACK", branchId: "rue-baghdad", branchName: "Hanaa Food Rue Baghdad" },
  { id: "driver-dev", email: "livreur@hanaa-food.test", name: "Livreur", role: "LIVREUR", branchId: null, branchName: null },
];

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function normalizePhone(value) {
  return String(value || "").replace(/[^0-9]/g, "").trim();
}

function passwordKey() {
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-password-v1|${String(process.env.DATABASE_URL || "")}`)
    .digest();
}

function expectedPassword(accountId) {
  const digest = crypto
    .createHmac("sha256", passwordKey())
    .update(String(accountId))
    .digest("base64url")
    .slice(0, 16);
  return `HF#${digest}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function findAccount(identifier) {
  const raw = String(identifier || "").trim();
  const lower = raw.toLowerCase();
  const phone = normalizePhone(raw);

  return accounts.find((item) =>
    item.email.toLowerCase() === lower ||
    item.name.toLowerCase() === lower ||
    (item.phone && normalizePhone(item.phone) === phone)
  ) || null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const body = bodyOf(req);
    const action = String(body.action || "");

    if (action === "login") {
      await ensureSchema();
      const account = findAccount(body.identifier);
      if (!account) {
        return res.status(401).json({ ok: false, code: "INVALID_STAFF_CREDENTIALS" });
      }

      const override = await getPool().query(
        "select password_salt,password_hash from public.staff_password_overrides where account_id=$1 limit 1",
        [account.id],
      );

      let valid = false;
      if (override.rows[0]) {
        try {
          const actual = crypto.scryptSync(
            String(body.password || ""),
            Buffer.from(String(override.rows[0].password_salt || ""), "hex"),
            64,
          );
          const expected = Buffer.from(String(override.rows[0].password_hash || ""), "hex");
          valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
        } catch {
          valid = false;
        }
      } else {
        valid = safeEqual(body.password, expectedPassword(account.id));
      }

      if (!valid) {
        return res.status(401).json({ ok: false, code: "INVALID_STAFF_CREDENTIALS" });
      }

      return res.status(200).json({
        ok: true,
        account: { ...account, active: true },
        staffApiToken: issueStaffToken(account),
      });
    }

    if (action === "list") {
      const staff = verifiedStaffFromRequest(req);
      if (!staff || staff.role !== "ADMIN") {
        return res.status(401).json({ ok: false, code: "ADMIN_AUTH_REQUIRED" });
      }
      return res.status(200).json({
        ok: true,
        accounts: accounts.map((item) => ({ ...item, active: true })),
      });
    }

    return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
  } catch (error) {
    console.error("staff auth failed", error);
    return res.status(500).json({ ok: false, code: "STAFF_AUTH_FAILED" });
  }
}

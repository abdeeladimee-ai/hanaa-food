import crypto from "node:crypto";
import { issueStaffToken, verifiedStaffFromRequest } from "../lib/staffAuth.js";

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
  const labels = {
    "admin-dev": "Admin",
    "snack-tadart-dev": "Tadart",
    "snack-amgala-dev": "Amgala",
    "snack-rue-baghdad-dev": "Baghdad",
    "driver-dev": "Livreur",
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
      const account = findAccount(body.identifier);
      if (!account || !safeEqual(body.password, expectedPassword(account.id))) {
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

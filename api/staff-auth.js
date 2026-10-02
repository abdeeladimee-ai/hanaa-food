import crypto from "node:crypto";
import { issueStaffToken, verifiedStaffFromRequest } from "../lib/staffAuth.js";

const STAFF_ACCOUNT_EDGE_URL =
  "https://kkmbiiiglgevwehhmtzq.supabase.co/functions/v1/staff-account-service";

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

function proofSecret() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "");
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-store-v2|${authToken}`)
    .digest();
}

function sign(value) {
  const key = proofSecret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function staffStoreProof(action, id, timestamp) {
  if (!proofSecret()) return "";
  return sign(`staff-store|${action}|${id}|${timestamp}`);
}

async function staffStoreCall(action, { id = "", row, patch } = {}) {
  const timestamp = Date.now();
  const proof = staffStoreProof(action, id, timestamp);
  if (!proof) {
    const error = new Error("STAFF_STORE_PROOF_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }

  const response = await fetch(STAFF_ACCOUNT_EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, id, row, patch, timestamp, proof }),
    signal: AbortSignal.timeout(10000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(String(payload?.code || "STAFF_STORE_UNAVAILABLE"));
    error.status = response.status;
    throw error;
  }
  return payload;
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

function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt$${salt.toString("hex")}$${hash}`;
}

function passwordMatches(password, encoded) {
  try {
    const [kind, saltHex, hashHex] = String(encoded || "").split("$");
    if (kind !== "scrypt" || !saltHex || !hashHex) return false;
    const actual = crypto.scryptSync(
      String(password || ""),
      Buffer.from(saltHex, "hex"),
      64,
    );
    const expected = Buffer.from(hashHex, "hex");
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

async function staffRows() {
  const payload = await staffStoreCall("read");
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

async function saveStaffRow(row) {
  const payload = await staffStoreCall("upsert", { id: String(row?.id || ""), row });
  return payload?.row || null;
}

async function patchStaffRow(id, patch) {
  const payload = await staffStoreCall("patch", { id, patch });
  return payload?.row || null;
}

async function removeStaffRow(id) {
  const payload = await staffStoreCall("delete", { id });
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

async function dynamicLogin(identifier, password) {
  const raw = String(identifier || "").trim();
  const phone = normalizePhone(raw);
  const rows = await staffRows();
  const row = rows
    .filter((item) => item?.active !== false)
    .find((item) =>
      (phone && String(item?.phone || "") === phone) ||
      String(item?.name || "").toLowerCase() === raw.toLowerCase()
    );

  if (!row || !passwordMatches(password, row.password_hash)) return null;
  return publicAccount(row);
}

async function listAccounts(req, res) {
  if (!requireAdmin(req, res)) return;
  const dynamic = await staffRows();
  return res.status(200).json({
    ok: true,
    accounts: [
      ...coreAccounts.map((item) => ({ ...item, active: true })),
      ...dynamic.map(publicAccount),
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

  const rows = await staffRows();
  const existing = rows.find((item) => String(item?.phone || "") === phone);
  const id = existing?.id || `staff-${crypto.randomUUID()}`;

  const saved = await saveStaffRow({
    id,
    email: existing?.email || null,
    phone,
    name,
    password_hash: passwordHash(password),
    role,
    branch_id: branchId,
    branch_name: branchName,
    active: true,
    updated_at: new Date().toISOString(),
  });

  if (!saved) {
    return res.status(500).json({ ok: false, code: "STAFF_STORE_WRITE_FAILED" });
  }

  return res.status(200).json({ ok: true, account: publicAccount(saved) });
}

async function toggleAccount(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const id = String(body.id || "").trim();
  const rows = await staffRows();
  const current = rows.find((item) => String(item?.id || "") === id);

  if (!current) {
    return res.status(404).json({ ok: false, code: "ACCOUNT_NOT_FOUND" });
  }

  const saved = await patchStaffRow(id, {
    active: current.active === false,
    updated_at: new Date().toISOString(),
  });

  if (!saved) {
    return res.status(404).json({ ok: false, code: "ACCOUNT_NOT_FOUND" });
  }

  return res.status(200).json({ ok: true, account: publicAccount(saved) });
}

async function deleteAccount(req, res, body) {
  if (!requireAdmin(req, res)) return;
  const id = String(body.id || "").trim();
  const deleted = await removeStaffRow(id);
  return res.status(200).json({ ok: true, deleted: deleted.length > 0 });
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
    return res.status(Number(error?.status || 500)).json({
      ok: false,
      code: String(error?.message || "STAFF_AUTH_FAILED"),
    });
  }
}

import crypto from "node:crypto";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secretKey() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-store-v2|${authToken}`)
    .digest();
}

function sign(action, id, timestamp) {
  const key = secretKey();
  if (!key) return "";
  return crypto
    .createHmac("sha256", key)
    .update(`staff-store|${action}|${id}|${timestamp}`)
    .digest("hex");
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const action = String(req.body?.action || "");
  const id = String(req.body?.id || "").trim();
  const timestamp = Number(req.body?.timestamp || 0);
  const proof = String(req.body?.proof || "").trim().toLowerCase();

  if (
    !["read", "upsert", "patch", "delete"].includes(action) ||
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() - timestamp) > 30000 ||
    !/^[0-9a-f]{64}$/.test(proof)
  ) {
    return res.status(403).json({ ok: false, code: "STAFF_STORE_PROOF_INVALID" });
  }

  const expected = sign(action, id, timestamp);
  if (!expected || !safeEqual(proof, expected)) {
    return res.status(403).json({ ok: false, code: "STAFF_STORE_PROOF_INVALID" });
  }

  return res.status(200).json({ ok: true });
}

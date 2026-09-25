import crypto from "node:crypto";

const ORDER_PROOF_MAX_AGE_MS = 5 * 60 * 1000;

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

function userAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 512);
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function secretKey() {
  return crypto
    .createHash("sha256")
    .update(`hanaa-order-proof-v1|${String(process.env.DATABASE_URL || "")}`)
    .digest();
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signature(encoded) {
  return crypto.createHmac("sha256", secretKey()).update(encoded).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function issueOrderProof(req, { orderId, phone }) {
  const now = Date.now();
  const payload = {
    v: 1,
    oid: String(orderId || "").trim(),
    phone: normalizePhone(phone).slice(-9),
    ip: digest(clientIp(req)).slice(0, 24),
    ua: digest(userAgent(req)).slice(0, 24),
    iat: now,
    exp: now + ORDER_PROOF_MAX_AGE_MS,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const encoded = encodePayload(payload);
  return {
    token: `${encoded}.${signature(encoded)}`,
    expiresAt: payload.exp,
  };
}

export function verifyOrderProof(req, token, { orderId, phone }) {
  try {
    const [encoded, receivedSignature, extra] = String(token || "").split(".");
    if (!encoded || !receivedSignature || extra) return false;
    if (!safeEqual(receivedSignature, signature(encoded))) return false;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const now = Date.now();
    if (payload?.v !== 1) return false;
    if (!Number.isFinite(payload?.iat) || !Number.isFinite(payload?.exp)) return false;
    if (payload.iat > now + 30_000 || payload.exp < now) return false;
    if (payload.exp - payload.iat > ORDER_PROOF_MAX_AGE_MS + 5_000) return false;
    if (String(payload.oid || "") !== String(orderId || "").trim()) return false;
    if (String(payload.phone || "") !== normalizePhone(phone).slice(-9)) return false;
    if (String(payload.ip || "") !== digest(clientIp(req)).slice(0, 24)) return false;
    if (String(payload.ua || "") !== digest(userAgent(req)).slice(0, 24)) return false;
    return true;
  } catch {
    return false;
  }
}

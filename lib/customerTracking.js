import crypto from "node:crypto";

const TRACKING_TTL_MS = 48 * 60 * 60 * 1000;

function key() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "");
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-customer-tracking-v1|${authToken}`)
    .digest();
}

function phoneKey(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function issueCustomerTrackingToken(orderId, phone) {
  const secret = key();
  if (!secret) throw new Error("TRACKING_NOT_CONFIGURED");
  const now = Date.now();
  const payload = {
    v: 1,
    oid: String(orderId || ""),
    phone: phoneKey(phone),
    iat: now,
    exp: now + TRACKING_TTL_MS,
    nonce: crypto.randomBytes(12).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyCustomerTrackingToken(token, orderId) {
  try {
    const secret = key();
    if (!secret) return null;
    const [body, signature, extra] = String(token || "").split(".");
    if (!body || !signature || extra || !safeEqual(signature, sign(body, secret))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Date.now();
    if (
      payload?.v !== 1 ||
      String(payload.oid || "") !== String(orderId || "") ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      payload.iat > now + 30000 ||
      payload.exp < now ||
      payload.exp - payload.iat > TRACKING_TTL_MS + 5000
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

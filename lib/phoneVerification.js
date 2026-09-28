import crypto from "node:crypto";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TRUSTED_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secretKey(purpose) {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "");
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`${purpose}|${authToken}`)
    .digest();
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signature(value, key) {
  return crypto.createHmac("sha256", key).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueToken(phone, purpose, ttlMs, version) {
  const key = secretKey(purpose);
  const normalizedPhone = normalizeMoroccanPhoneE164(phone);
  if (!key || !normalizedPhone) {
    throw new Error("PHONE_VERIFICATION_NOT_CONFIGURED");
  }

  const now = Date.now();
  const payload = {
    v: version,
    phone: normalizedPhone,
    iat: now,
    exp: now + ttlMs,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const encoded = encode(payload);
  return {
    token: `${encoded}.${signature(encoded, key)}`,
    expiresAt: payload.exp,
  };
}

function verifyToken(token, phone, purpose, ttlMs, version) {
  try {
    const key = secretKey(purpose);
    if (!key) return null;

    const [encoded, received, extra] = String(token || "").split(".");
    if (!encoded || !received || extra) return null;
    if (!safeEqual(received, signature(encoded, key))) return null;

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    const normalizedPhone = normalizeMoroccanPhoneE164(phone);
    const now = Date.now();

    if (
      payload?.v !== version ||
      !normalizedPhone ||
      payload.phone !== normalizedPhone ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      payload.iat > now + 30000 ||
      payload.exp < now ||
      payload.exp - payload.iat > ttlMs + 5000
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function normalizeMoroccanPhoneE164(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(5);
  if (digits.startsWith("212")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[67]\d{8}$/.test(digits) ? `+212${digits}` : "";
}

export function issuePhoneVerificationToken(phone) {
  return issueToken(
    phone,
    "hanaa-phone-verification-v1",
    TOKEN_TTL_MS,
    1,
  );
}

export function verifyPhoneVerificationToken(token, phone) {
  return verifyToken(
    token,
    phone,
    "hanaa-phone-verification-v1",
    TOKEN_TTL_MS,
    1,
  );
}

export function issueTrustedPhoneToken(phone) {
  return issueToken(
    phone,
    "hanaa-trusted-phone-v1",
    TRUSTED_TOKEN_TTL_MS,
    2,
  );
}

export function verifyTrustedPhoneToken(token, phone) {
  return verifyToken(
    token,
    phone,
    "hanaa-trusted-phone-v1",
    TRUSTED_TOKEN_TTL_MS,
    2,
  );
}

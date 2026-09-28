import crypto from "node:crypto";

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const LEGACY_GRACE_SECONDS = 30 * 24 * 60 * 60;

function signingSources() {
  const primary =
    String(process.env.STAFF_SESSION_SECRET || "").trim() ||
    String(process.env.TWILIO_AUTH_TOKEN || "").trim() ||
    String(process.env.DATABASE_URL || "").trim();

  const legacyDatabaseUrl = String(process.env.DATABASE_URL || "").trim();
  return [...new Set([primary, legacyDatabaseUrl].filter(Boolean))];
}

function signingKey(source) {
  if (!source) throw new Error("STAFF_SESSION_SECRET_MISSING");
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-session-v1|${source}`)
    .digest();
}

function signatureFor(body, source) {
  return crypto
    .createHmac("sha256", signingKey(source))
    .update(body)
    .digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function issueStaffToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    sub: String(account.id || account.name || "staff"),
    role: String(account.role || "").toUpperCase(),
    branchId: account.branch_id || account.branchId || null,
    branchName: account.branch_name || account.branchName || null,
    name: account.name || null,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const source = signingSources()[0];
  if (!source) throw new Error("STAFF_SESSION_SECRET_MISSING");
  return `${body}.${signatureFor(body, source)}`;
}

export function verifyStaffTokenValue(token) {
  const value = String(token || "").trim();
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const sources = signingSources();
  if (!sources.length) return null;

  const signatureValid = sources.some((source) =>
    safeEqual(signature, signatureFor(body, source)),
  );
  if (!signatureValid) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || !payload?.role) return null;
    if (!["ADMIN", "SNACK", "LIVREUR"].includes(String(payload.role).toUpperCase())) {
      return null;
    }

    const issuedAt = Number(payload?.iat || 0);
    const expiresAt = Number(payload?.exp || 0);

    if (expiresAt > now) return payload;

    // Gracefully keep older kiosk sessions alive after the backend migration.
    // A legacy token is accepted only if it was originally issued recently.
    if (
      Number.isFinite(issuedAt) &&
      issuedAt > 0 &&
      now - issuedAt <= LEGACY_GRACE_SECONDS
    ) {
      return payload;
    }

    return null;
  } catch {
    return null;
  }
}

export function verifiedStaffFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return null;
  return verifyStaffTokenValue(auth.slice(7).trim());
}

import crypto from "node:crypto";

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function signingKey() {
  const source = String(process.env.DATABASE_URL || "");
  if (!source) throw new Error("DATABASE_URL_MISSING");
  return crypto.createHash("sha256").update(`hanaa-staff-session-v1|${source}`).digest();
}

function signBody(body) {
  return crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
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
  return `${body}.${signBody(body)}`;
}

export function verifyStaffTokenValue(token) {
  const value = String(token || "").trim();
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const expected = signBody(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || !payload?.role || !payload?.exp || payload.exp <= now) return null;
    if (!["ADMIN", "SNACK", "LIVREUR"].includes(String(payload.role).toUpperCase())) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifiedStaffFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return null;
  return verifyStaffTokenValue(auth.slice(7).trim());
}

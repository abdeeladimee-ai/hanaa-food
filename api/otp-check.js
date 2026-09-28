import { issuePhoneVerificationToken, normalizeMoroccanPhoneE164 } from "../lib/phoneVerification.js";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_CHECKS_PER_PHONE = 8;

function limiter() {
  if (!globalThis.__hanaaOtpCheckLimits) globalThis.__hanaaOtpCheckLimits = new Map();
  return globalThis.__hanaaOtpCheckLimits;
}

function limited(key, max) {
  const now = Date.now();
  const map = limiter();
  const current = map.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    map.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > max;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const phone = normalizeMoroccanPhoneE164(req.body?.phone);
  const code = String(req.body?.code || "").replace(/\D/g, "").slice(0, 10);
  if (!phone || !/^\d{4,10}$/.test(code)) {
    return res.status(400).json({ ok: false, code: "OTP_INVALID" });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim() || "unknown";

  if (limited(`phone:${phone}`, MAX_CHECKS_PER_PHONE) || limited(`ip:${ip}`, 30)) {
    res.setHeader("Retry-After", "600");
    return res.status(429).json({ ok: false, code: "OTP_RATE_LIMITED" });
  }

  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const service = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();
  if (!sid || !authToken || !service) {
    return res.status(503).json({ ok: false, code: "OTP_NOT_CONFIGURED" });
  }

  const auth = Buffer.from(`${sid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({ To: phone, Code: code });

  try {
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(8000),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== "approved") {
      return res.status(400).json({ ok: false, code: "OTP_INVALID" });
    }

    const verification = issuePhoneVerificationToken(phone);
    return res.status(200).json({
      ok: true,
      status: "approved",
      phone,
      token: verification.token,
      expiresAt: verification.expiresAt,
    });
  } catch {
    return res.status(502).json({ ok: false, code: "OTP_PROVIDER_UNAVAILABLE" });
  }
}

import { issuePhoneVerificationToken, normalizeMoroccanPhoneE164 } from "../lib/phoneVerification.js";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_PHONE = 3;
const MAX_CHECKS_PER_PHONE = 8;
function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim();
}
function sameSiteRequest(req) {
  const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (site && !["same-origin", "same-site", "none"].includes(site)) return false;
  const origin = String(req.headers.origin || "").trim();
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!origin || !host) return true;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}
function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}
function limiter() {
  if (!globalThis.__hanaaPhoneOtpLimits) globalThis.__hanaaPhoneOtpLimits = new Map();
  return globalThis.__hanaaPhoneOtpLimits;
}
function limited(key, maximum) {
  const now = Date.now();
  const map = limiter();
  const current = map.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    map.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > maximum;
}
function twilioConfig() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();
  const tokenSecret = String(process.env.PHONE_VERIFICATION_SECRET || "");
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken ||
      !/^VA[0-9a-fA-F]{32}$/.test(serviceSid) || tokenSecret.length < 32) return null;
  return { accountSid, authToken, serviceSid };
}
async function verifyRequest(config, path, fields) {
  const authorization = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }
  if (!sameSiteRequest(req)) return send(res, 403, { ok: false, code: "ORIGIN_DENIED" });
  const config = twilioConfig();
  if (!config) return send(res, 503, { ok: false, code: "PHONE_VERIFICATION_NOT_CONFIGURED" });

  const body = bodyOf(req);
  const action = String(body.action || "");
  const phone = normalizeMoroccanPhoneE164(body.phone);
  const ip = clientIp(req);
  if (!phone || !ip || !["send", "check"].includes(action)) {
    return send(res, 400, { ok: false, code: "INVALID_PHONE_VERIFICATION_REQUEST" });
  }

  if (action === "send") {
    if (limited(`phone-send:${phone}`, MAX_SENDS_PER_PHONE) || limited(`ip-send:${ip}`, 12)) {
      res.setHeader("Retry-After", "600");
      return send(res, 429, { ok: false, code: "PHONE_OTP_RATE_LIMITED" });
    }
    try {
      const { response } = await verifyRequest(config, "Verifications", { To: phone, Channel: "sms" });
      if (!response.ok) return send(res, response.status === 429 ? 429 : 502, {
        ok: false, code: response.status === 429 ? "PHONE_OTP_RATE_LIMITED" : "PHONE_OTP_SEND_FAILED",
      });
      return send(res, 200, { ok: true, phone });
    } catch { return send(res, 502, { ok: false, code: "PHONE_OTP_SEND_FAILED" }); }
  }

  const code = String(body.code || "").replace(/\D/g, "").slice(0, 10);
  if (!/^\d{4,10}$/.test(code)) return send(res, 400, { ok: false, code: "INVALID_OTP" });
  if (limited(`ip-check:${ip}`, 30) || limited(`phone-check:${phone}`, MAX_CHECKS_PER_PHONE)) {
    res.setHeader("Retry-After", "600");
    return send(res, 429, { ok: false, code: "PHONE_OTP_RATE_LIMITED" });
  }
  try {
    const { response, payload } = await verifyRequest(config, "VerificationCheck", { To: phone, Code: code });
    if (!response.ok || payload?.status !== "approved") return send(res, 400, { ok: false, code: "INVALID_OTP" });
    return send(res, 200, { ok: true, phone, ...issuePhoneVerificationToken(phone) });
  } catch { return send(res, 502, { ok: false, code: "PHONE_OTP_VERIFY_FAILED" }); }
}

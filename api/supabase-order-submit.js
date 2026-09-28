import crypto from "node:crypto";
import { normalizeMoroccanPhoneE164 } from "../lib/phoneVerification.js";
import { issueCustomerTrackingToken } from "../lib/customerTracking.js";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_P_ADKKjVA91hIFkgFN4H6Q_OH1rxmSX";

function phoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(-9);
}

function proofSecret() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "");
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-supabase-order-v1|${authToken}`)
    .digest();
}

function signOrder(row, timestamp, tokenHash) {
  const key = proofSecret();
  if (!key) return "";
  const value = `${String(row.id || "")}|${phoneKey(row.customer_phone)}|${timestamp}|${tokenHash}`;
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function limiter() {
  if (!globalThis.__hanaaSupabaseOrderLimits) {
    globalThis.__hanaaSupabaseOrderLimits = new Map();
  }
  return globalThis.__hanaaSupabaseOrderLimits;
}

function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim() || "unknown";
  const now = Date.now();
  const map = limiter();
  const current = map.get(ip);

  if (!current || now - current.startedAt >= 60000) {
    map.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  return current.count > 12;
}

function basicValidOrder(row) {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      /^HF[A-Z0-9]{4,24}$/i.test(String(row.id || "").trim()) &&
      ["delivery", "pickup"].includes(String(row.order_type || "")) &&
      ["tadart", "amgala", "rue-baghdad"].includes(String(row.branch_id || "")) &&
      Array.isArray(row.items) &&
      row.items.length > 0 &&
      Number.isFinite(Number(row.total)) &&
      Number(row.total) > 0
  );
}

function statusFor(code) {
  if (code === "CUSTOMER_ORDERING_PAUSED") return 423;
  if (["ORDER_LIMIT_REACHED", "DAILY_ORDER_LIMIT_REACHED", "ORDER_RATE_LIMITED", "OTP_RATE_LIMITED"].includes(code)) return 429;
  if (["PHONE_TOKEN_REUSED", "ORDER_PROOF_INVALID", "ORDER_PROOF_EXPIRED"].includes(code)) return 403;
  if (["INVALID_ORDER", "OTP_INVALID"].includes(code)) return 400;
  return 502;
}

async function verifyTwilioOtp(phone, code) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

  if (!sid || !authToken || !serviceSid) {
    const error = new Error("OTP_NOT_CONFIGURED");
    error.code = "OTP_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }

  const auth = Buffer.from(`${sid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
      signal: AbortSignal.timeout(8000),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status !== "approved") {
    const error = new Error(response.status === 429 ? "OTP_RATE_LIMITED" : "OTP_INVALID");
    error.code = response.status === 429 ? "OTP_RATE_LIMITED" : "OTP_INVALID";
    error.status = response.status === 429 ? 429 : 400;
    throw error;
  }

  return { serviceSid, verificationSid: String(payload?.sid || "") };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  if (rateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ ok: false, code: "ORDER_RATE_LIMITED" });
  }

  const row = req.body?.row;
  const otpCode = String(req.body?.otpCode || "").replace(/\D/g, "").slice(0, 10);

  if (!basicValidOrder(row)) {
    return res.status(400).json({ ok: false, code: "INVALID_ORDER" });
  }

  const phone = normalizeMoroccanPhoneE164(row.customer_phone);
  if (!phone || !/^\d{4,10}$/.test(otpCode)) {
    return res.status(400).json({ ok: false, code: "OTP_INVALID" });
  }

  try {
    const verified = await verifyTwilioOtp(phone, otpCode);

    const tokenHash = crypto
      .createHash("sha256")
      .update(
        `${verified.serviceSid}|${phone}|${verified.verificationSid || otpCode}`,
      )
      .digest("hex");

    const timestamp = Date.now();
    const proof = signOrder(row, timestamp, tokenHash);
    if (!proof) {
      return res.status(503).json({ ok: false, code: "ORDER_PROOF_NOT_CONFIGURED" });
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/submit_verified_order`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_order: row,
          p_proof: proof,
          p_timestamp: timestamp,
          p_token_hash: tokenHash,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(payload?.message || payload?.code || "SUPABASE_ORDER_FAILED");
      console.error("supabase-order-submit rpc failed", { code, status: response.status });
      return res.status(statusFor(code)).json({ ok: false, code });
    }

    if (!payload?.ok || !payload?.row) {
      return res.status(502).json({ ok: false, code: "SUPABASE_ORDER_FAILED" });
    }

    const trackingToken = issueCustomerTrackingToken(
      payload.row.id,
      payload.row.customer_phone,
    );

    return res.status(201).json({ ...payload, trackingToken });
  } catch (error) {
    const code = String(error?.code || error?.message || "SUPABASE_ORDER_UNAVAILABLE");
    console.error("supabase-order-submit failed", { code, status: Number(error?.status || 0) });

    if (code === "OTP_INVALID") {
      return res.status(400).json({ ok: false, code });
    }
    if (code === "OTP_RATE_LIMITED") {
      res.setHeader("Retry-After", "600");
      return res.status(429).json({ ok: false, code });
    }
    if (code === "OTP_NOT_CONFIGURED") {
      return res.status(503).json({ ok: false, code });
    }

    return res.status(502).json({
      ok: false,
      code: error?.name === "TimeoutError" ? "SUPABASE_ORDER_TIMEOUT" : "SUPABASE_ORDER_UNAVAILABLE",
    });
  }
}

import crypto from "node:crypto";
import {
  issuePhoneVerificationToken,
  issueTrustedPhoneToken,
  normalizeMoroccanPhoneE164,
} from "../lib/phoneVerification.js";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya2V6eGhzd2ZvY3FsdnVqemR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTE1MjIsImV4cCI6MjEwNjAyNzUyMn0.IoIO9FJ_F612fv3a9iiotWv871S8E7Gs3Y02DSSHfHs";

function clientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim() ||
    "unknown"
  );
}

function opaqueRateKey(kind, value, authToken) {
  const key = crypto
    .createHash("sha256")
    .update(`hanaa-rate-key-v1|${authToken}`)
    .digest();
  return crypto
    .createHmac("sha256", key)
    .update(`${kind}|${String(value || "")}`)
    .digest("hex");
}

function rateProof(action, kind, key, timestamp, authToken) {
  const secret = crypto
    .createHash("sha256")
    .update(`hanaa-supabase-order-v1|${authToken}`)
    .digest();

  const value =
    action === "consume"
      ? `consume|${kind}|${key}|${timestamp}`
      : `${action}|${key}|${timestamp}`;

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

async function rpc(name, body) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_JWT,
        Authorization: `Bearer ${SUPABASE_ANON_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("OTP guard RPC failed", {
      name,
      status: response.status,
      code: payload?.message || payload?.code,
    });
    throw new Error("OTP_RATE_LIMIT_UNAVAILABLE");
  }
  return payload;
}

async function consumeLimit(kind, key, authToken) {
  const timestamp = Date.now();
  return rpc("consume_otp_rate_limit", {
    p_kind: kind,
    p_key: key,
    p_timestamp: timestamp,
    p_proof: rateProof("consume", kind, key, timestamp, authToken),
  });
}

async function checkFresh(key, authToken) {
  const timestamp = Date.now();
  return rpc("check_otp_fresh", {
    p_key: key,
    p_timestamp: timestamp,
    p_proof: rateProof("fresh", "", key, timestamp, authToken),
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const phone = normalizeMoroccanPhoneE164(req.body?.phone);
  const code = String(req.body?.code || "")
    .replace(/\D/g, "")
    .slice(0, 10);

  if (!phone || !/^\d{4,10}$/.test(code)) {
    return res.status(400).json({ ok: false, code: "OTP_INVALID" });
  }

  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const service = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

  if (!sid || !authToken || !service) {
    return res.status(503).json({ ok: false, code: "OTP_NOT_CONFIGURED" });
  }

  const phoneKey = opaqueRateKey("phone", phone, authToken);

  try {
    const fresh = await checkFresh(phoneKey, authToken);
    if (fresh?.ok !== true) {
      return res.status(400).json({
        ok: false,
        code:
          fresh?.code === "OTP_NOT_SENT"
            ? "OTP_NOT_SENT"
            : "OTP_EXPIRED",
        resendAfter: 300,
      });
    }

    const checks = await Promise.all([
      consumeLimit("check_phone", phoneKey, authToken),
      consumeLimit(
        "check_ip",
        opaqueRateKey("ip", clientIp(req), authToken),
        authToken,
      ),
    ]);

    const denied = checks.find((item) => item?.ok === false);
    if (denied) {
      const retryAfter = Math.max(
        1,
        Number(denied.retry_after || 600),
      );
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        ok: false,
        code: "OTP_RATE_LIMITED",
        retryAfter,
      });
    }
  } catch (error) {
    console.error("OTP check limiter unavailable", {
      message: error?.message,
    });
    return res.status(503).json({
      ok: false,
      code: "OTP_RATE_LIMIT_UNAVAILABLE",
    });
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

    if (response.status === 429) {
      res.setHeader("Retry-After", "600");
      return res.status(429).json({
        ok: false,
        code: "OTP_RATE_LIMITED",
      });
    }

    if (!response.ok || data.status !== "approved") {
      return res.status(400).json({
        ok: false,
        code: "OTP_INVALID",
      });
    }

    const verification = issuePhoneVerificationToken(phone);
    const trusted = issueTrustedPhoneToken(phone);

    return res.status(200).json({
      ok: true,
      status: "approved",
      phone,
      token: verification.token,
      expiresAt: verification.expiresAt,
      trustedToken: trusted.token,
      trustedExpiresAt: trusted.expiresAt,
    });
  } catch (error) {
    console.error("Twilio OTP check unavailable", {
      name: error?.name,
      message: error?.message,
    });
    return res.status(502).json({
      ok: false,
      code: "OTP_PROVIDER_UNAVAILABLE",
    });
  }
}

import crypto from "node:crypto";
import {
  issuePhoneVerificationToken,
  issueTrustedPhoneToken,
  normalizeMoroccanPhoneE164,
} from "../lib/phoneVerification.js";

const RATE_LIMIT_URLS = [
  "https://kkmbiiiglgevwehhmtzq.supabase.co/functions/v1/otp-rate-limit",
];

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
    .update(`hanaa-rate-edge-v1|${authToken}`)
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

async function rateRequest(action, kind, key, authToken) {
  let lastError = null;

  for (let index = 0; index < RATE_LIMIT_URLS.length; index += 1) {
    const timestamp = Date.now();
    try {
      const response = await fetch(RATE_LIMIT_URLS[index], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          kind,
          key,
          timestamp,
          proof: rateProof(action, kind, key, timestamp, authToken),
        }),
        signal: AbortSignal.timeout(index === 0 ? 4500 : 3000),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        if (index > 0) console.warn("OTP_CHECK_LIMITER_FAILOVER_ACTIVE");
        return payload;
      }

      const error = new Error("OTP_RATE_LIMIT_UNAVAILABLE");
      error.status = response.status;
      lastError = error;
      if (response.status < 500 && response.status !== 404) throw error;
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "TimeoutError" ||
        error?.name === "AbortError" ||
        error instanceof TypeError ||
        Number(error?.status || 0) >= 500 ||
        Number(error?.status || 0) === 404;
      if (!retryable) throw error;
    }
  }

  throw lastError || new Error("OTP_RATE_LIMIT_UNAVAILABLE");
}

async function consumeLimit(kind, key, authToken) {
  return rateRequest("consume", kind, key, authToken);
}

async function checkFresh(key, authToken) {
  return rateRequest("fresh", "", key, authToken);
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

import crypto from "node:crypto";

const RATE_LIMIT_URL =
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/otp-rate-limit";

function normalizeMoroccoPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return "+212" + digits.slice(1);
  if (/^212[67]\d{8}$/.test(digits)) return "+" + digits;
  if (/^[67]\d{8}$/.test(digits)) return "+212" + digits;
  return "";
}

function twilioConfig() {
  return {
    sid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
    token: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
    service: String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim(),
  };
}

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
  const timestamp = Date.now();
  const response = await fetch(RATE_LIMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      kind,
      key,
      timestamp,
      proof: rateProof(action, kind, key, timestamp, authToken),
    }),
    signal: AbortSignal.timeout(6000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("OTP guard Edge failed", {
      action,
      kind,
      status: response.status,
      code: payload?.code,
    });
    throw new Error("OTP_RATE_LIMIT_UNAVAILABLE");
  }

  return payload;
}

async function consumeLimit(kind, key, authToken) {
  return rateRequest("consume", kind, key, authToken);
}

async function reserveSend(key, authToken) {
  return rateRequest("reserve", "", key, authToken);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const config = twilioConfig();

  if (req.method === "GET" && String(req.query?.health || "") === "1") {
    if (!config.sid || !config.token || !config.service) {
      return res.status(503).json({
        ok: false,
        twilioConfigured: false,
        signedLimiter: false,
      });
    }

    try {
      const healthKey = opaqueRateKey(
        "health",
        "otp-send",
        config.token,
      );
      await reserveSend(healthKey, config.token);
      return res.status(200).json({
        ok: true,
        twilioConfigured: true,
        signedLimiter: true,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        twilioConfigured: true,
        signedLimiter: false,
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      code: "METHOD_NOT_ALLOWED",
    });
  }

  const phone = normalizeMoroccoPhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_PHONE",
    });
  }

  const { sid, token, service } = config;
  if (!sid || !token || !service) {
    return res.status(503).json({
      ok: false,
      code: "OTP_NOT_CONFIGURED",
    });
  }

  const phoneKey = opaqueRateKey("phone", phone, token);
  const ipKey = opaqueRateKey("ip", clientIp(req), token);
  const globalKey = opaqueRateKey("global", "hanaa-food", token);

  try {
    const checks = await Promise.all([
      consumeLimit("send_phone_day", phoneKey, token),
      consumeLimit("send_ip", ipKey, token),
      consumeLimit("send_ip_day", ipKey, token),
      consumeLimit("send_global_hour", globalKey, token),
      consumeLimit("send_global_day", globalKey, token),
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

    const reservation = await reserveSend(phoneKey, token);
    if (reservation?.ok === false) {
      const retryAfter = Math.max(
        1,
        Number(reservation.retry_after || 300),
      );
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        ok: false,
        code: "OTP_RESEND_WAIT",
        retryAfter,
      });
    }
  } catch (error) {
    console.error("OTP limiter unavailable", {
      message: error?.message,
    });
    return res.status(503).json({
      ok: false,
      code: "OTP_RATE_LIMIT_UNAVAILABLE",
    });
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({
    To: phone,
    Channel: "sms",
  });

  try {
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,
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

    if (!response.ok) {
      console.error("Twilio OTP send failed", {
        status: response.status,
        code: data?.code,
      });

      if (response.status === 429) {
        res.setHeader("Retry-After", "600");
        return res.status(429).json({
          ok: false,
          code: "OTP_RATE_LIMITED",
        });
      }

      return res
        .status(response.status >= 500 ? 502 : 400)
        .json({
          ok: false,
          code: "OTP_SEND_FAILED",
        });
    }

    return res.status(200).json({
      ok: true,
      status: data.status || "pending",
      validFor: 60,
      resendAfter: 300,
    });
  } catch (error) {
    console.error("Twilio OTP provider unavailable", {
      name: error?.name,
      message: error?.message,
    });
    return res.status(502).json({
      ok: false,
      code: "OTP_PROVIDER_UNAVAILABLE",
    });
  }
}

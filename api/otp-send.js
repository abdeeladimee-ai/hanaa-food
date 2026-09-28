import crypto from "node:crypto";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_ANON_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya2V6eGhzd2ZvY3FsdnVqemR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTE1MjIsImV4cCI6MjEwNjAyNzUyMn0.IoIO9FJ_F612fv3a9iiotWv871S8E7Gs3Y02DSSHfHs";

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

async function consumeLimit(kind, key) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/consume_otp_rate_limit`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_JWT,
        Authorization: `Bearer ${SUPABASE_ANON_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_kind: kind, p_key: key }),
      signal: AbortSignal.timeout(5000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("OTP_RATE_LIMIT_UNAVAILABLE");
  return payload;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const phone = normalizeMoroccoPhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ ok: false, code: "INVALID_PHONE" });
  }

  const { sid, token, service } = twilioConfig();
  if (!sid || !token || !service) {
    return res.status(503).json({ ok: false, code: "OTP_NOT_CONFIGURED" });
  }

  const phoneKey = opaqueRateKey("phone", phone, token);
  const ipKey = opaqueRateKey("ip", clientIp(req), token);

  try {
    const checks = await Promise.all([
      consumeLimit("send_phone", phoneKey),
      consumeLimit("send_phone_day", phoneKey),
      consumeLimit("send_ip", ipKey),
      consumeLimit("send_ip_day", ipKey),
    ]);

    const denied = checks.find((item) => item?.ok === false);
    if (denied) {
      const retryAfter = Math.max(1, Number(denied.retry_after || 600));
      res.setHeader("Retry-After", String(retryAfter));
      return res
        .status(429)
        .json({ ok: false, code: "OTP_RATE_LIMITED", retryAfter });
    }
  } catch (error) {
    console.error("OTP limiter unavailable", { message: error?.message });
    return res
      .status(503)
      .json({ ok: false, code: "OTP_RATE_LIMIT_UNAVAILABLE" });
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({ To: phone, Channel: "sms" });

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
        return res.status(429).json({ ok: false, code: "OTP_RATE_LIMITED" });
      }

      return res
        .status(response.status >= 500 ? 502 : 400)
        .json({ ok: false, code: "OTP_SEND_FAILED" });
    }

    return res
      .status(200)
      .json({ ok: true, status: data.status || "pending" });
  } catch (error) {
    console.error("Twilio OTP provider unavailable", {
      name: error?.name,
      message: error?.message,
    });
    return res
      .status(502)
      .json({ ok: false, code: "OTP_PROVIDER_UNAVAILABLE" });
  }
}

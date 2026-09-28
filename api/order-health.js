import crypto from "node:crypto";

const EDGE_HEALTH_URL =
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/submit-order-otp?health=1";
const OTP_GUARD_URL =
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/otp-rate-limit";

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

async function checkOtpGuard(authToken) {
  const key = crypto
    .createHash("sha256")
    .update("hanaa-health-check")
    .digest("hex");
  const timestamp = Date.now();

  try {
    const response = await fetch(OTP_GUARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fresh",
        kind: "",
        key,
        timestamp,
        proof: rateProof("fresh", "", key, timestamp, authToken),
      }),
      signal: AbortSignal.timeout(6000),
    });

    const payload = await response.json().catch(() => ({}));
    return (
      response.ok &&
      payload?.ok === false &&
      payload?.code === "OTP_NOT_SENT"
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const twilioConfigured = Boolean(
    String(process.env.TWILIO_ACCOUNT_SID || "").trim() &&
      authToken &&
      String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim(),
  );

  try {
    const [edgeResponse, otpGuard] = await Promise.all([
      fetch(EDGE_HEALTH_URL, {
        signal: AbortSignal.timeout(7000),
      }),
      authToken ? checkOtpGuard(authToken) : Promise.resolve(false),
    ]);

    const edge = await edgeResponse.json().catch(() => ({}));

    const ok =
      edgeResponse.ok &&
      edge?.ok === true &&
      edge?.database === true &&
      twilioConfigured &&
      otpGuard;

    return res.status(ok ? 200 : 503).json({
      ok,
      twilioConfigured,
      database: edge?.database === true,
      orderingPaused: edge?.orderingPaused === true,
      otpGuard,
      edgeCode: edge?.code || null,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      twilioConfigured,
      database: false,
      orderingPaused: false,
      otpGuard: false,
      edgeCode:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "EDGE_HEALTH_TIMEOUT"
          : "EDGE_HEALTH_UNAVAILABLE",
    });
  }
}

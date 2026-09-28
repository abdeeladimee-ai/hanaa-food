const EDGE_HEALTH_URL =
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/submit-order-otp?health=1";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const twilioConfigured = Boolean(
    String(process.env.TWILIO_ACCOUNT_SID || "").trim() &&
      String(process.env.TWILIO_AUTH_TOKEN || "").trim() &&
      String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim(),
  );

  try {
    const response = await fetch(EDGE_HEALTH_URL, {
      signal: AbortSignal.timeout(7000),
    });
    const edge = await response.json().catch(() => ({}));

    const ok =
      response.ok &&
      edge?.ok === true &&
      edge?.database === true &&
      twilioConfigured;

    return res.status(ok ? 200 : 503).json({
      ok,
      twilioConfigured,
      database: edge?.database === true,
      orderingPaused: edge?.orderingPaused === true,
      edgeCode: edge?.code || null,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      twilioConfigured,
      database: false,
      orderingPaused: false,
      edgeCode:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "EDGE_HEALTH_TIMEOUT"
          : "EDGE_HEALTH_UNAVAILABLE",
    });
  }
}

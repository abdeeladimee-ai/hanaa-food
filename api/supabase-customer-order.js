import crypto from "node:crypto";
import { verifyCustomerTrackingToken } from "../lib/customerTracking.js";

const CUSTOMER_EDGE_URL =
  "https://kkmbiiiglgevwehhmtzq.supabase.co/functions/v1/customer-order-service";

function secretKey() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-customer-read-v1|${authToken}`)
    .digest();
}

function sign(orderId, timestamp) {
  const key = secretKey();
  if (!key) return "";
  return crypto
    .createHmac("sha256", key)
    .update(`customer-read|${orderId}|${timestamp}`)
    .digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const orderId = String(req.query?.id || "").trim();
  const trackingToken = String(req.query?.trackingToken || "").trim();

  if (!orderId || !verifyCustomerTrackingToken(trackingToken, orderId)) {
    return res.status(403).json({ ok: false, code: "TRACKING_TOKEN_REQUIRED" });
  }

  const timestamp = Date.now();
  const proof = sign(orderId, timestamp);
  if (!proof) {
    return res.status(503).json({ ok: false, code: "TRACKING_NOT_CONFIGURED" });
  }

  try {
    const response = await fetch(CUSTOMER_EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, timestamp, proof }),
      signal: AbortSignal.timeout(9000),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const code = String(payload?.code || "TRACKING_FAILED");
      return res
        .status(code === "ORDER_NOT_FOUND" ? 404 : response.status >= 500 ? 502 : response.status)
        .json({ ok: false, code });
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      code: error?.name === "TimeoutError" ? "TRACKING_TIMEOUT" : "TRACKING_UNAVAILABLE",
    });
  }
}

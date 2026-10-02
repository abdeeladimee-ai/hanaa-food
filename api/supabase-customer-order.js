import crypto from "node:crypto";
import { verifyCustomerTrackingToken } from "../lib/customerTracking.js";

const CUSTOMER_EDGE_URLS = [
  "https://kkmbiiiglgevwehhmtzq.supabase.co/functions/v1/customer-order-service",
];

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

  let lastCode = "TRACKING_UNAVAILABLE";
  let lastStatus = 502;

  for (let index = 0; index < CUSTOMER_EDGE_URLS.length; index += 1) {
    try {
      const response = await fetch(CUSTOMER_EDGE_URLS[index], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, timestamp, proof }),
        signal: AbortSignal.timeout(index === 0 ? 6500 : 4500),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok !== false) {
        if (index > 0) console.warn("TRACKING_FAILOVER_ACTIVE");
        return res.status(200).json(payload);
      }

      const code = String(payload?.code || "TRACKING_FAILED");
      lastCode = code;
      lastStatus =
        code === "ORDER_NOT_FOUND"
          ? 404
          : response.status >= 500
            ? 502
            : response.status;

      const canFallback =
        response.status >= 500 ||
        response.status === 404 ||
        ["TRACKING_UNAVAILABLE", "TRACKING_TIMEOUT", "ORDER_NOT_FOUND"].includes(code);

      if (!canFallback) {
        return res.status(lastStatus).json({ ok: false, code });
      }
    } catch (error) {
      lastCode =
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "TRACKING_TIMEOUT"
          : "TRACKING_UNAVAILABLE";
      lastStatus = 502;
    }
  }

  return res.status(lastStatus).json({ ok: false, code: lastCode });
}

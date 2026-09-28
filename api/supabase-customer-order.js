import crypto from "node:crypto";
import { verifyCustomerTrackingToken } from "../lib/customerTracking.js";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_P_ADKKjVA91hIFkgFN4H6Q_OH1rxmSX";

function proofSecret() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-supabase-order-v1|${authToken}`)
    .digest();
}

function sign(value) {
  const key = proofSecret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(value).digest("hex");
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
  const proof = sign(`customer|${orderId}|${timestamp}`);
  if (!proof) {
    return res.status(503).json({ ok: false, code: "TRACKING_NOT_CONFIGURED" });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/customer_read_order`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_order_id: orderId,
          p_timestamp: timestamp,
          p_proof: proof,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(payload?.message || payload?.code || "TRACKING_FAILED");
      return res.status(code === "ORDER_NOT_FOUND" ? 404 : 502).json({ ok: false, code });
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      code: error?.name === "TimeoutError" ? "TRACKING_TIMEOUT" : "TRACKING_UNAVAILABLE",
    });
  }
}

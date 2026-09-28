import { issueCustomerTrackingToken } from "../lib/customerTracking.js";

const SUPABASE_FUNCTION_URL =
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/submit-order-otp";
const SUPABASE_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya2V6eGhzd2ZvY3FsdnVqemR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTE1MjIsImV4cCI6MjEwNjAyNzUyMn0.IoIO9FJ_F612fv3a9iiotWv871S8E7Gs3Y02DSSHfHs";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

function phoneKey(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function validOrder(row) {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      /^HF[A-Z0-9]{4,24}$/i.test(String(row.id || "").trim()) &&
      ["delivery", "pickup"].includes(String(row.order_type || "")) &&
      ["tadart", "amgala", "rue-baghdad"].includes(String(row.branch_id || "")) &&
      /^[67]\d{8}$/.test(phoneKey(row.customer_phone)) &&
      Array.isArray(row.items) &&
      row.items.length >= 1 &&
      row.items.length <= 100 &&
      Number.isFinite(Number(row.total)) &&
      Number(row.total) > 0
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const row = req.body?.row;
  const otpCode = String(req.body?.otpCode || "").replace(/\D/g, "").slice(0, 10);

  if (!validOrder(row) || !/^\d{4,10}$/.test(otpCode)) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_JWT}`,
        apikey: SUPABASE_ANON_JWT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ row, otpCode }),
      signal: AbortSignal.timeout(15000),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.ok !== true || !payload?.row) {
      const code = String(payload?.code || "SUPABASE_ORDER_FAILED");
      console.error("submit-order-otp edge failed", {
        code,
        status: response.status,
      });
      return send(res, response.status || 502, { ok: false, code });
    }

    const trackingToken = issueCustomerTrackingToken(
      payload.row.id,
      payload.row.customer_phone,
    );

    return send(res, 201, {
      ok: true,
      row: payload.row,
      trackingToken,
    });
  } catch (error) {
    console.error("submit-order-otp edge unavailable", {
      name: error?.name,
      message: error?.message,
    });
    return send(res, 502, {
      ok: false,
      code:
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "SUPABASE_ORDER_TIMEOUT"
          : "SUPABASE_ORDER_UNAVAILABLE",
    });
  }
}

import {
  normalizeMoroccanPhoneE164,
  verifyPhoneVerificationToken,
} from "../lib/phoneVerification.js";
import { issueCustomerTrackingToken } from "../lib/customerTracking.js";

const SUPABASE_FUNCTION_URL =
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/submit-order-otp";

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
      Number(row.total) > 0 &&
      Number(row.total) <= 20000
  );
}

function statusFor(code, fallback = 502) {
  if (code === "CUSTOMER_ORDERING_PAUSED") return 423;
  if (["ORDER_LIMIT_REACHED", "DAILY_ORDER_LIMIT_REACHED"].includes(code)) return 429;
  if (["PHONE_TOKEN_REUSED", "PHONE_TOKEN_INVALID"].includes(code)) return 403;
  if (code === "INVALID_ORDER") return 400;
  return fallback;
}

async function submitToSupabase(row, phoneVerificationToken) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(SUPABASE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row,
          verificationToken: phoneVerificationToken,
        }),
        signal: AbortSignal.timeout(7000),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload?.ok === true && payload?.row) {
        return payload;
      }

      const code = String(payload?.code || "SUPABASE_ORDER_FAILED");
      const error = new Error(code);
      error.code = code;
      error.status = response.status;

      if (response.status < 500 || attempt === 1) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "TimeoutError" ||
        error?.name === "AbortError" ||
        error instanceof TypeError ||
        Number(error?.status || 0) >= 500;

      if (!retryable || attempt === 1) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError || new Error("SUPABASE_ORDER_UNAVAILABLE");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const row = req.body?.row;
  const phoneVerificationToken = String(
    req.body?.phoneVerificationToken || "",
  ).trim();

  if (!validOrder(row) || !phoneVerificationToken || phoneVerificationToken.length > 2048) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const phone = normalizeMoroccanPhoneE164(row.customer_phone);
  if (!phone) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const verified = verifyPhoneVerificationToken(
    phoneVerificationToken,
    phone,
  );

  if (!verified) {
    return send(res, 403, { ok: false, code: "PHONE_TOKEN_INVALID" });
  }

  try {
    const payload = await submitToSupabase(row, phoneVerificationToken);

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
    const code = String(
      error?.code || error?.message || "SUPABASE_ORDER_UNAVAILABLE",
    );

    console.error("supabase-order-submit failed", {
      code,
      status: Number(error?.status || 0),
      name: error?.name,
    });

    const timeout =
      error?.name === "TimeoutError" || error?.name === "AbortError";

    return send(
      res,
      statusFor(code, timeout ? 504 : Number(error?.status || 502)),
      {
        ok: false,
        code: timeout ? "SUPABASE_ORDER_TIMEOUT" : code,
      },
    );
  }
}

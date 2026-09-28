import crypto from "node:crypto";
import { verifyPhoneVerificationToken } from "../lib/phoneVerification.js";
import { issueCustomerTrackingToken } from "../lib/customerTracking.js";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_P_ADKKjVA91hIFkgFN4H6Q_OH1rxmSX";

function sameSiteRequest(req) {
  const site = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (site && !["same-origin", "same-site", "none"].includes(site)) return false;

  const origin = String(req.headers.origin || "").trim();
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!origin || !host) return true;

  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function phoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(-9);
}

function proofSecret() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "");
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-supabase-order-v1|${authToken}`)
    .digest();
}

function signOrder(row, timestamp, tokenHash) {
  const key = proofSecret();
  if (!key) return "";
  const value = `${String(row.id || "")}|${phoneKey(row.customer_phone)}|${timestamp}|${tokenHash}`;
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function limiter() {
  if (!globalThis.__hanaaSupabaseOrderLimits) {
    globalThis.__hanaaSupabaseOrderLimits = new Map();
  }
  return globalThis.__hanaaSupabaseOrderLimits;
}

function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim() || "unknown";
  const now = Date.now();
  const map = limiter();
  const current = map.get(ip);

  if (!current || now - current.startedAt >= 60000) {
    map.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  return current.count > 20;
}

function statusFor(code) {
  if (code === "CUSTOMER_ORDERING_PAUSED") return 423;
  if (["ORDER_LIMIT_REACHED", "DAILY_ORDER_LIMIT_REACHED"].includes(code)) return 429;
  if (["PHONE_TOKEN_INVALID", "PHONE_TOKEN_REUSED", "PHONE_VERIFICATION_REQUIRED", "ORDER_PROOF_INVALID", "ORDER_PROOF_EXPIRED"].includes(code)) return 403;
  if (code === "INVALID_ORDER") return 400;
  return 502;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  if (!sameSiteRequest(req)) {
    return res.status(403).json({ ok: false, code: "ORIGIN_DENIED" });
  }

  if (rateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ ok: false, code: "ORDER_RATE_LIMITED" });
  }

  const row = req.body?.row;
  const phoneVerificationToken = String(req.body?.phoneVerificationToken || "").trim();

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return res.status(400).json({ ok: false, code: "INVALID_ORDER" });
  }

  const verified = verifyPhoneVerificationToken(
    phoneVerificationToken,
    row.customer_phone,
  );

  if (!verified) {
    return res.status(403).json({ ok: false, code: "PHONE_VERIFICATION_REQUIRED" });
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(phoneVerificationToken)
    .digest("hex");

  const timestamp = Date.now();
  const proof = signOrder(row, timestamp, tokenHash);
  if (!proof) {
    return res.status(503).json({ ok: false, code: "ORDER_PROOF_NOT_CONFIGURED" });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/submit_verified_order`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_order: row,
          p_proof: proof,
          p_timestamp: timestamp,
          p_token_hash: tokenHash,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(payload?.message || payload?.code || "SUPABASE_ORDER_FAILED");
      return res.status(statusFor(code)).json({ ok: false, code });
    }

    if (!payload?.ok || !payload?.row) {
      return res.status(502).json({ ok: false, code: "SUPABASE_ORDER_FAILED" });
    }

    const trackingToken = issueCustomerTrackingToken(
      payload.row.id,
      payload.row.customer_phone,
    );
    return res.status(201).json({ ...payload, trackingToken });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      code: error?.name === "TimeoutError" ? "SUPABASE_ORDER_TIMEOUT" : "SUPABASE_ORDER_UNAVAILABLE",
    });
  }
}

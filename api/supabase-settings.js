import crypto from "node:crypto";
import { verifiedStaffFromRequest } from "../lib/staffAuth.js";

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

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function readSetting() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/app_settings?key=eq.customer_ordering&select=value,updated_at`,
    {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(String(payload?.message || payload?.code || "SETTINGS_READ_FAILED"));
    error.status = response.status;
    throw error;
  }

  const row = payload?.[0] || null;
  return {
    ok: true,
    paused: row?.value?.paused === true,
    updatedAt: row?.updated_at || null,
  };
}

async function updateSetting(req) {
  const staff = verifiedStaffFromRequest(req);
  if (!staff || String(staff.role || "").toUpperCase() !== "ADMIN") {
    const error = new Error("ADMIN_AUTH_REQUIRED");
    error.status = 401;
    throw error;
  }

  if (!proofSecret()) {
    const error = new Error("SETTINGS_PROOF_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }

  const paused = bodyOf(req).paused === true;
  const timestamp = Date.now();
  const proof = sign(`settings|${timestamp}`);

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/app_settings?key=eq.customer_ordering`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "X-Hanaa-Settings-Timestamp": String(timestamp),
        "X-Hanaa-Settings-Proof": proof,
      },
      body: JSON.stringify({
        value: { paused },
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    },
  );

  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(String(payload?.message || payload?.code || "SETTINGS_UPDATE_FAILED"));
    error.status = response.status;
    throw error;
  }

  const row = payload?.[0];
  if (!row) {
    const error = new Error("SETTINGS_UPDATE_DENIED");
    error.status = 403;
    throw error;
  }

  return {
    ok: true,
    paused: row?.value?.paused === true,
    updatedAt: row?.updated_at || null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return send(res, 200, await readSetting());
    }

    if (req.method === "PATCH") {
      return send(res, 200, await updateSetting(req));
    }

    res.setHeader("Allow", "GET, PATCH");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const status = Number(error?.status || 500);
    return send(res, status, {
      ok: false,
      code: String(error?.message || "SUPABASE_SETTINGS_FAILED"),
    });
  }
}

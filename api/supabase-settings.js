import { verifiedStaffFromRequest } from "../lib/staffAuth.js";
import { signSettingsRequest } from "./settings-proof-check.js";

const SETTINGS_EDGE_URLS = [
  "https://kkmbiiiglgevwehhmtzq.supabase.co/functions/v1/settings-service",
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/settings-service",
];
const CACHE_MS = 30 * 1000;
const STALE_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

function send(res, status, body, cacheable = false) {
  res.setHeader(
    "Cache-Control",
    cacheable
      ? "public, s-maxage=30, stale-while-revalidate=300"
      : "no-store",
  );
  return res.status(status).json(body);
}

async function callOneSettingsEdge(url, action, paused, timeoutMs) {
  const timestamp = Date.now();
  const proof = signSettingsRequest(action, paused, timestamp);
  if (!proof) {
    const error = new Error("SETTINGS_PROOF_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, paused, timestamp, proof }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    const error = new Error(String(payload?.code || "SUPABASE_SETTINGS_FAILED"));
    error.status = response.status || 502;
    throw error;
  }

  return payload;
}

async function callSettingsEdge(action, paused) {
  if (action === "update") {
    const results = await Promise.allSettled(
      SETTINGS_EDGE_URLS.map((url, index) =>
        callOneSettingsEdge(url, action, paused, index === 0 ? 5500 : 3000),
      ),
    );

    const success = results.find((item) => item.status === "fulfilled");
    if (success) return success.value;

    const firstError = results.find((item) => item.status === "rejected");
    throw firstError?.reason || new Error("SUPABASE_SETTINGS_FAILED");
  }

  let lastError = null;
  for (let index = 0; index < SETTINGS_EDGE_URLS.length; index += 1) {
    try {
      const payload = await callOneSettingsEdge(
        SETTINGS_EDGE_URLS[index],
        action,
        paused,
        index === 0 ? 5500 : 3500,
      );
      if (index > 0) console.warn("SETTINGS_FAILOVER_ACTIVE");
      return payload;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (status > 0 && status < 500 && status !== 404) throw error;
    }
  }

  throw lastError || new Error("SUPABASE_SETTINGS_FAILED");
}

async function readSetting() {
  const age = Date.now() - cachedAt;
  if (cached && age < CACHE_MS) return cached;

  try {
    const payload = await callSettingsEdge("read");
    cached = {
      ok: true,
      paused: payload?.paused === true,
      updatedAt: payload?.updatedAt || null,
    };
    cachedAt = Date.now();
    return cached;
  } catch (error) {
    if (cached && age < STALE_MS) return { ...cached, stale: true };
    throw error;
  }
}

async function updateSetting(req) {
  const staff = verifiedStaffFromRequest(req);
  if (!staff || String(staff.role || "").toUpperCase() !== "ADMIN") {
    const error = new Error("ADMIN_AUTH_REQUIRED");
    error.status = 401;
    throw error;
  }

  const paused = req.body?.paused === true;
  const payload = await callSettingsEdge("update", paused);
  cached = {
    ok: true,
    paused: payload?.paused === true,
    updatedAt: payload?.updatedAt || null,
  };
  cachedAt = Date.now();
  return cached;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return send(res, 200, await readSetting(), true);
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

import crypto from "node:crypto";
import { verifiedStaffFromRequest } from "../lib/staffAuth.js";

const STAFF_EDGE_URLS = [
  "https://kkmbiiiglgevwehhmtzq.supabase.co/functions/v1/staff-orders-service",
  "https://grkezxhswfocqlvujzdy.supabase.co/functions/v1/staff-orders-service",
];

function secretKey() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-edge-v1|${authToken}`)
    .digest();
}

function canonical(body) {
  return [
    String(body?.action || ""),
    String(body?.role || "").toUpperCase(),
    String(body?.staffId || ""),
    String(body?.branchId || ""),
    String(body?.requestedBranch || ""),
    String(body?.orderId || ""),
    String(body?.updatedSince || ""),
    String(body?.limit || ""),
    String(body?.statusLabel || ""),
    String(body?.timestamp || ""),
  ].join("|");
}

function sign(body) {
  const key = secretKey();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(canonical(body)).digest("hex");
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function callStaffEdgeUrl(url, body, timeoutMs = 7000) {
  const proof = sign(body);
  if (!proof) {
    const error = new Error("STAFF_EDGE_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, proof }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(String(payload?.code || "SUPABASE_STAFF_FAILED"));
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function readAcrossBackends(body) {
  const results = await Promise.allSettled(
    STAFF_EDGE_URLS.map((url, index) =>
      callStaffEdgeUrl(url, body, index === 0 ? 6000 : 3500),
    ),
  );

  const rows = [];
  let firstError = null;

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (Array.isArray(result.value?.rows)) rows.push(...result.value.rows);
    } else if (!firstError) {
      firstError = result.reason;
    }
  }

  if (!rows.length && results.every((item) => item.status === "rejected")) {
    throw firstError || new Error("SUPABASE_STAFF_FAILED");
  }

  const byId = new Map();
  for (const row of rows) {
    const id = String(row?.id || "");
    if (!id) continue;

    const current = byId.get(id);
    if (!current) {
      byId.set(id, row);
      continue;
    }

    const currentTime =
      Date.parse(String(current?.updated_at || current?.created_at || "")) || 0;
    const rowTime =
      Date.parse(String(row?.updated_at || row?.created_at || "")) || 0;

    if (rowTime > currentTime) byId.set(id, row);
  }

  const limit = Math.max(1, Math.min(100, Number(body?.limit || 60)));
  const merged = [...byId.values()]
    .sort((left, right) => {
      const leftTime =
        Date.parse(String(left?.updated_at || left?.created_at || "")) || 0;
      const rightTime =
        Date.parse(String(right?.updated_at || right?.created_at || "")) || 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);

  return { ok: true, rows: merged };
}

async function updateWithFailover(body) {
  let lastError = null;

  for (let index = 0; index < STAFF_EDGE_URLS.length; index += 1) {
    try {
      const payload = await callStaffEdgeUrl(
        STAFF_EDGE_URLS[index],
        body,
        index === 0 ? 6500 : 4500,
      );
      if (index > 0) console.warn("STAFF_ORDER_FAILOVER_ACTIVE");
      return payload;
    } catch (error) {
      lastError = error;
      const code = String(error?.message || "");
      const status = Number(error?.status || 0);
      const canFallback =
        code === "ORDER_NOT_FOUND" ||
        status >= 500 ||
        status === 404 ||
        error?.name === "TimeoutError" ||
        error?.name === "AbortError";

      if (!canFallback) throw error;
    }
  }

  throw lastError || new Error("SUPABASE_STAFF_FAILED");
}

export default async function handler(req, res) {
  const staff = verifiedStaffFromRequest(req);
  if (!staff) return send(res, 401, { ok: false, code: "STAFF_AUTH_REQUIRED" });

  const role = String(staff.role || "").toUpperCase();
  const staffId = String(staff.sub || "");
  const branchId = String(staff.branchId || "");
  const timestamp = Date.now();

  try {
    if (req.method === "GET") {
      const requestedBranch = String(req.query?.branchId || "");
      const orderId = String(req.query?.id || "");
      const updatedSince = String(req.query?.updatedSince || "");
      const requestedLimit = Number(req.query?.limit || 60);
      const limit = Math.max(
        1,
        Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 60),
      );

      const payload = await readAcrossBackends({
        action: "read",
        role,
        staffId,
        branchId,
        requestedBranch,
        orderId,
        updatedSince,
        limit,
        statusLabel: "",
        timestamp,
      });

      return send(res, 200, payload);
    }

    if (req.method === "PATCH") {
      const row = req.body?.row;
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return send(res, 400, { ok: false, code: "INVALID_ORDER" });
      }

      const payload = await updateWithFailover({
        action: "update",
        role,
        staffId,
        branchId,
        requestedBranch: "",
        orderId: String(row.id || ""),
        updatedSince: "",
        limit: "",
        statusLabel: String(row.status_label || ""),
        timestamp,
        row,
      });

      return send(res, 200, payload);
    }

    res.setHeader("Allow", "GET, PATCH");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = String(error?.message || "SUPABASE_STAFF_FAILED");
    const upstreamStatus = Number(error?.status || 0);

    const status = [
      "WRONG_BRANCH",
      "ORDER_TAKEN_BY_ANOTHER_DRIVER",
      "ORDER_NOT_AVAILABLE",
      "INVALID_DRIVER_TRANSITION",
      "DELIVERY_ONLY",
    ].includes(code)
      ? 409
      : code === "ORDER_NOT_FOUND"
        ? 404
        : upstreamStatus === 403
          ? 403
          : upstreamStatus === 401
            ? 401
            : 502;

    return send(res, status, { ok: false, code });
  }
}

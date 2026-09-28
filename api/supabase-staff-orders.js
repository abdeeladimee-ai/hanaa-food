import crypto from "node:crypto";
import { verifiedStaffFromRequest } from "../lib/staffAuth.js";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_P_ADKKjVA91hIFkgFN4H6Q_OH1rxmSX";
const STAFF_EDGE_URL = `${SUPABASE_URL}/functions/v1/staff-orders-service`;

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

async function callStaffEdge(body) {
  const proof = sign(body);
  if (!proof) {
    const error = new Error("STAFF_EDGE_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }

  const response = await fetch(STAFF_EDGE_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, proof }),
    signal: AbortSignal.timeout(10000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(String(payload?.code || "SUPABASE_STAFF_FAILED"));
    error.status = response.status;
    throw error;
  }

  return payload;
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

      const payload = await callStaffEdge({
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

      const payload = await callStaffEdge({
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

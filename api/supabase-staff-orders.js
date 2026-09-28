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

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function callRpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.message || payload?.code || "SUPABASE_STAFF_FAILED"));
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

  if (!proofSecret()) {
    return send(res, 503, { ok: false, code: "STAFF_PROOF_NOT_CONFIGURED" });
  }

  try {
    if (req.method === "GET") {
      const requestedBranch = String(req.query?.branchId || "");
      const orderId = String(req.query?.id || "");
      const updatedSince = String(req.query?.updatedSince || "") || null;
      const requestedLimit = Number(req.query?.limit || 60);
      const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 60));
      const proof = sign(`${role}|${staffId}|${branchId}|${timestamp}`);

      const payload = await callRpc("staff_read_orders", {
        p_role: role,
        p_staff_id: staffId,
        p_branch_id: branchId || null,
        p_requested_branch: requestedBranch || null,
        p_order_id: orderId || null,
        p_updated_since: updatedSince,
        p_limit: limit,
        p_timestamp: timestamp,
        p_proof: proof,
      });

      return send(res, 200, payload);
    }

    if (req.method === "PATCH") {
      const row = req.body?.row;
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return send(res, 400, { ok: false, code: "INVALID_ORDER" });
      }

      const orderId = String(row.id || "");
      const statusLabel = String(row.status_label || "");
      const proof = sign(`${orderId}|${role}|${staffId}|${branchId}|${statusLabel}|${timestamp}`);

      const payload = await callRpc("staff_update_order", {
        p_row: row,
        p_role: role,
        p_staff_id: staffId,
        p_branch_id: branchId || null,
        p_timestamp: timestamp,
        p_proof: proof,
      });

      return send(res, 200, payload);
    }

    res.setHeader("Allow", "GET, PATCH");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = String(error?.message || "SUPABASE_STAFF_FAILED");
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
        : code.includes("PROOF") || code.includes("AUTH")
          ? 403
          : 502;

    return send(res, status, { ok: false, code });
  }
}

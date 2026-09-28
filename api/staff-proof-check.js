import crypto from "node:crypto";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secretKey() {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) return null;
  return crypto
    .createHash("sha256")
    .update(`hanaa-staff-edge-v1|${authToken}`)
    .digest();
}

function canonical(body) {
  const action = String(body?.action || "");
  const role = String(body?.role || "").toUpperCase();
  const staffId = String(body?.staffId || "");
  const branchId = String(body?.branchId || "");
  const requestedBranch = String(body?.requestedBranch || "");
  const orderId = String(body?.orderId || "");
  const updatedSince = String(body?.updatedSince || "");
  const limit = String(body?.limit || "");
  const statusLabel = String(body?.statusLabel || "");
  const timestamp = Number(body?.timestamp || 0);

  return [
    action,
    role,
    staffId,
    branchId,
    requestedBranch,
    orderId,
    updatedSince,
    limit,
    statusLabel,
    String(timestamp),
  ].join("|");
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const body = req.body || {};
  const action = String(body.action || "");
  const role = String(body.role || "").toUpperCase();
  const timestamp = Number(body.timestamp || 0);
  const proof = String(body.proof || "").trim().toLowerCase();

  if (
    !["read", "update"].includes(action) ||
    !["ADMIN", "SNACK", "LIVREUR"].includes(role) ||
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() - timestamp) > 30000 ||
    !/^[0-9a-f]{64}$/.test(proof)
  ) {
    return res.status(403).json({ ok: false, code: "STAFF_EDGE_PROOF_INVALID" });
  }

  const key = secretKey();
  if (!key) {
    return res.status(503).json({ ok: false, code: "STAFF_EDGE_NOT_CONFIGURED" });
  }

  const expected = crypto
    .createHmac("sha256", key)
    .update(canonical(body))
    .digest("hex");

  if (!safeEqual(proof, expected)) {
    return res.status(403).json({ ok: false, code: "STAFF_EDGE_PROOF_INVALID" });
  }

  return res.status(200).json({ ok: true });
}

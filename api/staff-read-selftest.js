import crypto from "node:crypto";

const SUPABASE_URL = "https://grkezxhswfocqlvujzdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_P_ADKKjVA91hIFkgFN4H6Q_OH1rxmSX";

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
    String(body.action || ""),
    String(body.role || "").toUpperCase(),
    String(body.staffId || ""),
    String(body.branchId || ""),
    String(body.requestedBranch || ""),
    String(body.orderId || ""),
    String(body.updatedSince || ""),
    String(body.limit || ""),
    String(body.statusLabel || ""),
    String(body.timestamp || ""),
  ].join("|");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false });

  const body = {
    action: "read",
    role: "SNACK",
    staffId: "snack-tadart-selftest",
    branchId: "tadart",
    requestedBranch: "tadart",
    orderId: "",
    updatedSince: "",
    limit: 10,
    statusLabel: "",
    timestamp: Date.now(),
  };

  const key = secretKey();
  if (!key) return res.status(503).json({ ok: false, code: "NOT_CONFIGURED" });

  const proof = crypto
    .createHmac("sha256", key)
    .update(canonical(body))
    .digest("hex");

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/staff-orders-service`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, proof }),
      signal: AbortSignal.timeout(8000),
    },
  );

  const payload = await response.json().catch(() => ({}));
  return res.status(response.ok && payload?.ok === true ? 200 : 502).json({
    ok: response.ok && payload?.ok === true,
    upstreamStatus: response.status,
    code: payload?.code || null,
    branch: "tadart",
    count: Array.isArray(payload?.rows) ? payload.rows.length : 0,
  });
}

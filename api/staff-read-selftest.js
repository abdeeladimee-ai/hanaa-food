import crypto from "node:crypto";

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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false });

  const timestamp = Date.now();
  const role = "SNACK";
  const staffId = "snack-tadart-selftest";
  const branchId = "tadart";
  const proof = sign(`${role}|${staffId}|${branchId}|${timestamp}`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/staff_read_orders`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_role: role,
      p_staff_id: staffId,
      p_branch_id: branchId,
      p_requested_branch: branchId,
      p_order_id: null,
      p_updated_since: null,
      p_limit: 10,
      p_timestamp: timestamp,
      p_proof: proof,
    }),
    signal: AbortSignal.timeout(8000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return res.status(502).json({
      ok: false,
      upstreamStatus: response.status,
      code: String(payload?.message || payload?.code || "SELFTEST_FAILED"),
    });
  }

  return res.status(200).json({
    ok: true,
    branch: branchId,
    count: Array.isArray(payload?.rows) ? payload.rows.length : 0,
  });
}

import crypto from "node:crypto";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function expectedProof(action, kind, key, timestamp, authToken) {
  const secret = crypto
    .createHash("sha256")
    .update(`hanaa-rate-edge-v1|${authToken}`)
    .digest();

  const value =
    action === "consume"
      ? `consume|${kind}|${key}|${timestamp}`
      : `${action}|${key}|${timestamp}`;

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const action = String(req.body?.action || "").trim();
  const kind = String(req.body?.kind || "").trim();
  const key = String(req.body?.key || "").trim().toLowerCase();
  const timestamp = Number(req.body?.timestamp || 0);
  const proof = String(req.body?.proof || "").trim().toLowerCase();

  if (
    !["consume", "reserve", "fresh"].includes(action) ||
    !/^[0-9a-f]{64}$/.test(key) ||
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() - timestamp) > 30000 ||
    !/^[0-9a-f]{64}$/.test(proof)
  ) {
    return res.status(403).json({ ok: false, code: "RATE_PROOF_INVALID" });
  }

  if (action === "consume" && ![
    "send_phone",
    "send_ip",
    "send_phone_day",
    "send_ip_day",
    "send_global_hour",
    "send_global_day",
    "check_phone",
    "check_ip",
  ].includes(kind)) {
    return res.status(403).json({ ok: false, code: "RATE_PROOF_INVALID" });
  }

  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) {
    return res.status(503).json({ ok: false, code: "RATE_PROOF_NOT_CONFIGURED" });
  }

  const expected = expectedProof(action, kind, key, timestamp, authToken);
  if (!safeEqual(proof, expected)) {
    return res.status(403).json({ ok: false, code: "RATE_PROOF_INVALID" });
  }

  return res.status(200).json({ ok: true });
}

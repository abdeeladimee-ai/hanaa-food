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
    .update(`hanaa-settings-edge-v2|${authToken}`)
    .digest();
}

function canonical(action, paused, timestamp) {
  const pausedValue = typeof paused === "boolean" ? (paused ? "1" : "0") : "";
  return `${action}|${pausedValue}|${timestamp}`;
}

export function signSettingsRequest(action, paused, timestamp) {
  const key = secretKey();
  if (!key) return "";
  return crypto
    .createHmac("sha256", key)
    .update(canonical(action, paused, timestamp))
    .digest("hex");
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const action = String(req.body?.action || "");
  const paused = req.body?.paused;
  const timestamp = Number(req.body?.timestamp || 0);
  const proof = String(req.body?.proof || "").trim().toLowerCase();

  if (
    !["read", "update"].includes(action) ||
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() - timestamp) > 30000 ||
    !/^[0-9a-f]{64}$/.test(proof) ||
    (action === "update" && typeof paused !== "boolean")
  ) {
    return res.status(403).json({ ok: false, code: "SETTINGS_PROOF_INVALID" });
  }

  const expected = signSettingsRequest(action, paused, timestamp);
  if (!expected || !safeEqual(proof, expected)) {
    return res.status(403).json({ ok: false, code: "SETTINGS_PROOF_INVALID" });
  }

  return res.status(200).json({ ok: true });
}

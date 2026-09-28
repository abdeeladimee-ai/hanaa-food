import {
  normalizeMoroccanPhoneE164,
  verifyPhoneVerificationToken,
} from "../lib/phoneVerification.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const phone = normalizeMoroccanPhoneE164(req.body?.phone);
  const token = String(req.body?.token || "").trim();

  if (!phone || !token || token.length > 2048) {
    return res.status(400).json({ ok: false, code: "PHONE_TOKEN_INVALID" });
  }

  const payload = verifyPhoneVerificationToken(token, phone);
  if (!payload) {
    return res.status(403).json({ ok: false, code: "PHONE_TOKEN_INVALID" });
  }

  return res.status(200).json({
    ok: true,
    phone,
    expiresAt: payload.exp,
  });
}

function normalizeMoroccoPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return "+212" + digits.slice(1);
  if (/^212[67]\d{8}$/.test(digits)) return "+" + digits;
  if (/^[67]\d{8}$/.test(digits)) return "+212" + digits;
  return "";
}

function twilioConfig() {
  return {
    sid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
    token: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
    service: String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  const phone = normalizeMoroccoPhone(req.body?.phone);
  if (!phone) return res.status(400).json({ ok: false, code: "INVALID_PHONE" });
  const { sid, token, service } = twilioConfig();
  if (!sid || !token || !service) return res.status(503).json({ ok: false, code: "OTP_NOT_CONFIGURED" });

  const auth = Buffer.from(sid + ":" + token).toString("base64");
  const body = new URLSearchParams({ To: phone, Channel: "sms" });
  try {
    const response = await fetch("https://verify.twilio.com/v2/Services/" + encodeURIComponent(service) + "/Verifications", {
      method: "POST",
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status >= 500 ? 502 : 400).json({ ok: false, code: "OTP_SEND_FAILED" });
    return res.status(200).json({ ok: true, status: data.status || "pending" });
  } catch {
    return res.status(502).json({ ok: false, code: "OTP_PROVIDER_UNAVAILABLE" });
  }
}

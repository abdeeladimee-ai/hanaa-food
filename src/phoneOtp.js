export function normalizeMoroccanPhoneE164(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(5);
  if (digits.startsWith("212")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[67]\d{8}$/.test(digits) ? `+212${digits}` : "";
}
async function request(action, phone, code = "") {
  const response = await fetch("/api/phone-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, phone, code }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.code || "PHONE_OTP_FAILED");
    error.code = payload?.code || "";
    error.status = response.status;
    throw error;
  }
  return payload;
}
export async function sendPhoneOtp(value) {
  const phone = normalizeMoroccanPhoneE164(value);
  if (!phone) { const error = new Error("INVALID_PHONE"); error.code = "INVALID_PHONE"; throw error; }
  return (await request("send", phone)).phone;
}
export async function verifyPhoneOtp(value, token) {
  const phone = normalizeMoroccanPhoneE164(value);
  const code = String(token || "").replace(/\D/g, "").slice(0, 10);
  if (!phone || !/^\d{4,10}$/.test(code)) { const error = new Error("INVALID_OTP"); error.code = "INVALID_OTP"; throw error; }
  const result = await request("check", phone, code);
  if (result.phone !== phone || !result.token) { const error = new Error("PHONE_VERIFICATION_MISMATCH"); error.code = "PHONE_VERIFICATION_MISMATCH"; throw error; }
  return { phone: result.phone, token: result.token };
}

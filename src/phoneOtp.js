import { requireSupabase } from "./supabase";

export function normalizeMoroccanPhoneE164(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(5);
  if (digits.startsWith("212")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[67]\d{8}$/.test(digits)) return "";
  return `+212${digits}`;
}

export async function sendPhoneOtp(value) {
  const phone = normalizeMoroccanPhoneE164(value);
  if (!phone) {
    const error = new Error("INVALID_PHONE");
    error.code = "INVALID_PHONE";
    throw error;
  }

  const { error } = await requireSupabase().auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  });

  if (error) throw error;
  return phone;
}

export async function verifyPhoneOtp(value, token) {
  const phone = normalizeMoroccanPhoneE164(value);
  const code = String(token || "").replace(/\D/g, "").slice(0, 6);

  if (!phone || code.length !== 6) {
    const error = new Error("INVALID_OTP");
    error.code = "INVALID_OTP";
    throw error;
  }

  const { data, error } = await requireSupabase().auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });

  if (error) throw error;

  const verifiedPhone = normalizeMoroccanPhoneE164(data?.user?.phone || "");
  if (!verifiedPhone || verifiedPhone !== phone) {
    const mismatch = new Error("PHONE_VERIFICATION_MISMATCH");
    mismatch.code = "PHONE_VERIFICATION_MISMATCH";
    throw mismatch;
  }

  return verifiedPhone;
}

export async function currentVerifiedPhone() {
  const { data } = await requireSupabase().auth.getUser();
  return normalizeMoroccanPhoneE164(data?.user?.phone || "");
}

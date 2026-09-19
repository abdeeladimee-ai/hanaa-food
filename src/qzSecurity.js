const QZ_TOKEN_KEY = "hanaa-qz-pairing-token";
const QZ_CERT_URL = "/qz/digital-certificate.txt";
const QZ_SIGN_FUNCTION = "/functions/v1/qz-sign";

function getSupabaseUrl() {
  const value = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  if (!value) throw new Error("VITE_SUPABASE_URL manquante.");
  return value;
}

function getPairingToken() {
  let token = localStorage.getItem(QZ_TOKEN_KEY)?.trim() || "";
  if (token) return token;

  token = window.prompt(
    "Code impression QZ Hanaa Food (une seule fois):",
  )?.trim() || "";

  if (!token) throw new Error("Code impression QZ manquant.");
  localStorage.setItem(QZ_TOKEN_KEY, token);
  return token;
}

async function signRequest(toSign, allowRetry = true) {
  const token = getPairingToken();
  const response = await fetch(
    getSupabaseUrl() + QZ_SIGN_FUNCTION,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ request: toSign }),
    },
  );

  if (response.status === 401 && allowRetry) {
    localStorage.removeItem(QZ_TOKEN_KEY);
    return signRequest(toSign, false);
  }

  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || "Signature QZ impossible.");
  }

  return (await response.text()).trim();
}

export function configureQzSecurity(qz) {
  if (!qz?.security || qz.__hanaaSecurityConfigured) return;

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setCertificatePromise(
    async () => {
      const response = await fetch(QZ_CERT_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Certificat QZ introuvable.");
      return response.text();
    },
    { rejectOnFailure: true },
  );
  qz.security.setSignaturePromise(async (toSign) => signRequest(toSign));

  Object.defineProperty(qz, "__hanaaSecurityConfigured", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export function clearQzPairingToken() {
  localStorage.removeItem(QZ_TOKEN_KEY);
}

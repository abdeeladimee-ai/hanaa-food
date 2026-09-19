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
  if (!qz?.security) return false;
  if (qz.__hanaaSecurityConfigured) return false;

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setCertificatePromise(
    (resolve, reject) => {
      fetch(QZ_CERT_URL, {
        cache: "no-store",
        headers: { "Content-Type": "text/plain" },
      })
        .then((response) => {
          if (!response.ok) throw new Error("Certificat QZ introuvable.");
          return response.text();
        })
        .then(resolve)
        .catch(reject);
    },
    { rejectOnFailure: true },
  );

  qz.security.setSignaturePromise((toSign) => {
    return (resolve, reject) => {
      signRequest(toSign).then(resolve).catch(reject);
    };
  });

  Object.defineProperty(qz, "__hanaaSecurityConfigured", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return true;
}

export function clearQzPairingToken() {
  localStorage.removeItem(QZ_TOKEN_KEY);
}

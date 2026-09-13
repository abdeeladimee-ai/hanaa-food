const STAFF_PATHS = ["/snack", "/livreur", "/login", "/admin"];
const LOCATION_STORAGE_KEY = "hanaa-forced-location";
const LOCATION_CACHE_MS = 10 * 60 * 1000;

function isCustomerPage() {
  if (typeof window === "undefined") return false;
  return !STAFF_PATHS.some(
    (path) =>
      window.location.pathname === path ||
      window.location.pathname.startsWith(`${path}/`),
  );
}

function getOverlay() {
  return document.getElementById("hanaa-location-gate");
}

function setGateMessage(message) {
  const target = document.getElementById("hanaa-location-gate-message");
  if (target) target.textContent = message;
}

function setGateButton({ text, disabled = false } = {}) {
  const button = document.getElementById("hanaa-location-gate-button");
  if (!button) return;
  if (text) button.textContent = text;
  button.disabled = disabled;
}

function removeGate() {
  getOverlay()?.remove();
}

function ensureGate() {
  if (!isCustomerPage() || getOverlay()) return;

  const overlay = document.createElement("div");
  overlay.id = "hanaa-location-gate";
  overlay.innerHTML = `
    <div class="hanaa-location-gate-card" role="dialog" aria-modal="true" aria-labelledby="hanaa-location-gate-title">
      <img src="/hanaa-logo.png" alt="Hanaa Food" />
      <h1 id="hanaa-location-gate-title">Active ta position</h1>
      <p>La position est obligatoire pour choisir automatiquement le restaurant qui livrera ta commande.</p>
      <p id="hanaa-location-gate-message" class="hanaa-location-gate-message">Clique sur le bouton puis choisis Autoriser.</p>
      <button id="hanaa-location-gate-button" type="button">AUTORISER MA POSITION</button>
    </div>
  `;

  if (!document.getElementById("hanaa-location-gate-style")) {
    const style = document.createElement("style");
    style.id = "hanaa-location-gate-style";
    style.textContent = `
      #hanaa-location-gate {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(255, 255, 255, .98);
        font-family: Arial, sans-serif;
      }
      .hanaa-location-gate-card {
        width: min(440px, 100%);
        text-align: center;
        background: #fff;
        border: 1px solid #eadfe0;
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 18px 60px rgba(0,0,0,.14);
      }
      .hanaa-location-gate-card img {
        width: 92px;
        height: 92px;
        object-fit: contain;
        margin-bottom: 8px;
      }
      .hanaa-location-gate-card h1 {
        margin: 6px 0 10px;
        font-size: 28px;
        color: #351417;
      }
      .hanaa-location-gate-card p {
        margin: 8px 0;
        line-height: 1.5;
        color: #5b4547;
      }
      .hanaa-location-gate-message {
        font-weight: 800;
        color: #D71920 !important;
      }
      #hanaa-location-gate-button {
        width: 100%;
        min-height: 54px;
        margin-top: 18px;
        border: 0;
        border-radius: 14px;
        background: #D71920;
        color: #fff;
        font-size: 15px;
        font-weight: 900;
        cursor: pointer;
      }
      #hanaa-location-gate-button:disabled {
        opacity: .65;
        cursor: wait;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
  document
    .getElementById("hanaa-location-gate-button")
    ?.addEventListener("click", requestLocation);
}

function readCachedLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    const updatedAt = new Date(saved?.updatedAt || 0).getTime();
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > LOCATION_CACHE_MS) {
      return null;
    }
    if (!Number.isFinite(Number(saved?.latitude)) || !Number.isFinite(Number(saved?.longitude))) {
      return null;
    }
    return {
      coords: {
        latitude: Number(saved.latitude),
        longitude: Number(saved.longitude),
        accuracy: Number(saved.accuracy || 0),
      },
    };
  } catch {
    return null;
  }
}

function autoSelectNearestDeliveryBranch() {
  if (!isCustomerPage()) return;

  const trySelect = () => {
    const picker = document.querySelector(".branch-picker.delivery-branches");
    if (!picker) return false;

    const recommended = picker.querySelector("button.recommended");
    if (!recommended) return false;
    if (recommended.classList.contains("selected")) return true;

    recommended.click();
    return true;
  };

  if (trySelect()) return;

  const observer = new MutationObserver(() => {
    if (trySelect()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15000);
}

let locationSynced = false;
function syncLocationIntoApp(position) {
  if (locationSynced || !position?.coords) {
    autoSelectNearestDeliveryBranch();
    return;
  }

  const tryClick = () => {
    if (locationSynced || !isCustomerPage()) return false;

    const buttons = [...document.querySelectorAll("button")];
    const button = buttons.find((item) =>
      String(item.textContent || "")
        .toLowerCase()
        .includes("utiliser ma position actuelle"),
    );
    if (!button) return false;

    const geo = navigator.geolocation;
    const originalGetCurrentPosition = geo?.getCurrentPosition;

    if (!geo || typeof originalGetCurrentPosition !== "function") return false;

    try {
      geo.getCurrentPosition = (success) => success(position);
      locationSynced = true;
      button.click();
    } catch {
      locationSynced = false;
      return false;
    } finally {
      window.setTimeout(() => {
        try {
          geo.getCurrentPosition = originalGetCurrentPosition;
        } catch {
          // Browser host object may be read-only; nothing else to do.
        }
      }, 0);
    }

    autoSelectNearestDeliveryBranch();
    return true;
  };

  if (tryClick()) return;

  const observer = new MutationObserver(() => {
    if (tryClick()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 10000);
}

function onLocationSuccess(position) {
  const location = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  removeGate();
  syncLocationIntoApp(position);
}

function onLocationError(error) {
  setGateButton({ text: "REESSAYER", disabled: false });

  if (error?.code === 1) {
    setGateMessage(
      "La localisation est refusee. Active l'autorisation du site dans le navigateur puis reessaie.",
    );
    return;
  }

  if (error?.code === 3) {
    setGateMessage(
      "La position met trop de temps. Active le GPS du telephone puis appuie sur Reessayer.",
    );
    return;
  }

  setGateMessage(
    "Position indisponible pour le moment. Active le GPS puis appuie sur Reessayer.",
  );
}

function requestLocation() {
  if (!isCustomerPage()) return;
  ensureGate();

  setGateButton({ text: "LOCALISATION...", disabled: true });
  setGateMessage("Demande de localisation en cours...");

  if (!navigator.geolocation) {
    setGateButton({ text: "REESSAYER", disabled: false });
    setGateMessage("La localisation n'est pas disponible sur cet appareil.");
    return;
  }

  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: false,
    timeout: 15000,
    maximumAge: 600000,
  });
}

function startCustomerLocationGate() {
  if (!isCustomerPage()) return;

  const cached = readCachedLocation();
  if (cached) {
    syncLocationIntoApp(cached);
    return;
  }

  ensureGate();
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startCustomerLocationGate, {
      once: true,
    });
  } else {
    startCustomerLocationGate();
  }
}

const STAFF_PATHS = ["/snack", "/livreur", "/login", "/admin"];
const LOCATION_STORAGE_KEY = "hanaa-forced-location";

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
      <p id="hanaa-location-gate-message" class="hanaa-location-gate-message">Autorise la localisation pour continuer.</p>
      <button id="hanaa-location-gate-button" type="button">AUTORISER MA POSITION</button>
    </div>
  `;

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
  document.body.appendChild(overlay);
  document
    .getElementById("hanaa-location-gate-button")
    ?.addEventListener("click", requestLocation);
}

let autoLocationClicked = false;
function syncLocationIntoApp() {
  if (autoLocationClicked) return;

  const tryClick = () => {
    if (autoLocationClicked || !isCustomerPage()) return;
    const buttons = [...document.querySelectorAll("button")];
    const button = buttons.find((item) =>
      String(item.textContent || "")
        .toLowerCase()
        .includes("utiliser ma position actuelle"),
    );
    if (!button) return;
    autoLocationClicked = true;
    button.click();
  };

  tryClick();
  if (autoLocationClicked) return;

  const observer = new MutationObserver(() => {
    tryClick();
    if (autoLocationClicked) observer.disconnect();
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
  syncLocationIntoApp();
}

function onLocationError(error) {
  const button = document.getElementById("hanaa-location-gate-button");
  if (button) button.disabled = false;

  if (error?.code === 1) {
    setGateMessage(
      "La localisation est refusee. Autorise-la dans les permissions du navigateur pour continuer.",
    );
    return;
  }

  setGateMessage(
    "Impossible d'obtenir ta position. Verifie le GPS et reessaie.",
  );
}

function requestLocation() {
  if (!isCustomerPage()) return;
  ensureGate();

  const button = document.getElementById("hanaa-location-gate-button");
  if (button) button.disabled = true;
  setGateMessage("Demande de localisation en cours...");

  if (!navigator.geolocation) {
    if (button) button.disabled = false;
    setGateMessage("La localisation n'est pas disponible sur cet appareil.");
    return;
  }

  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 60000,
  });
}

function startCustomerLocationGate() {
  if (!isCustomerPage()) return;
  ensureGate();
  requestLocation();
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

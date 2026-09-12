(() => {
  const path = window.location.pathname.toLowerCase();
  const internalPrefixes = ["/login", "/admin", "/snack", "/livreur"];
  if (internalPrefixes.some((prefix) => path.startsWith(prefix))) return;

  const OVERLAY_ID = "hanaa-location-gate";
  const STYLE_ID = "hanaa-location-gate-style";

  const addStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        padding: 14px;
        background: #fff8f7;
        font-family: Arial, sans-serif;
      }
      #${OVERLAY_ID} .hanaa-location-card {
        width: min(330px, 100%);
        padding: 18px 16px;
        border: 1px solid #f0d6d8;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 16px 40px rgba(120, 0, 0, .10);
        text-align: center;
      }
      #${OVERLAY_ID} img {
        width: 60px;
        max-width: 22vw;
        height: auto;
        margin-bottom: 3px;
      }
      #${OVERLAY_ID} h1 {
        margin: 0 0 10px;
        color: #241516;
        font-size: 20px;
        line-height: 1.15;
      }
      #${OVERLAY_ID} .hanaa-location-status {
        min-height: 18px;
        margin: 0;
        color: #8b7779;
        font-size: 12px;
        font-weight: 700;
      }
      #${OVERLAY_ID} button {
        display: none;
        width: 100%;
        min-height: 46px;
        margin-top: 10px;
        padding: 11px 14px;
        border: 0;
        border-radius: 13px;
        color: #fff;
        background: #d71920;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      #${OVERLAY_ID} button.show { display: block; }
      @media (min-width: 521px) {
        #${OVERLAY_ID} img { width: 76px; }
        #${OVERLAY_ID} h1 { font-size: 22px; }
      }
    `;
    document.head.appendChild(style);
  };

  const createGate = () => {
    addStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="hanaa-location-card">
        <img src="/hanaa-logo.png" alt="Hanaa Food" />
        <h1>Activez votre position</h1>
        <p class="hanaa-location-status" id="hanaa-location-status">Autorisez la localisation dans le navigateur.</p>
        <button type="button" id="hanaa-location-allow">📍 Autoriser</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return overlay;
  };

  const removeGate = () => {
    document.getElementById(OVERLAY_ID)?.remove();
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  };

  const syncLocationWithApp = () => {
    let attempts = 0;
    const sync = () => {
      attempts += 1;
      const button = Array.from(document.querySelectorAll("button")).find((item) =>
        (item.textContent || "").toLowerCase().includes("utiliser ma position actuelle"),
      );
      if (button && !button.disabled) {
        button.click();
        setTimeout(removeGate, 450);
        return;
      }
      if (attempts < 40) setTimeout(sync, 100);
      else removeGate();
    };
    sync();
  };

  let requesting = false;
  const requestLocation = () => {
    if (requesting) return;
    const status = document.getElementById("hanaa-location-status");
    const allowButton = document.getElementById("hanaa-location-allow");

    if (!navigator.geolocation) {
      if (status) status.textContent = "Localisation non disponible sur cet appareil.";
      return;
    }

    requesting = true;
    if (status) status.textContent = "Autorisez la localisation dans le navigateur.";
    allowButton?.classList.remove("show");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        requesting = false;
        try {
          sessionStorage.setItem(
            "hanaa-location-last",
            JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              at: Date.now(),
            }),
          );
        } catch (_) {}
        syncLocationWithApp();
      },
      () => {
        requesting = false;
        if (status) status.textContent = "La localisation est obligatoire pour commander.";
        if (allowButton) allowButton.classList.add("show");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const start = () => {
    const gate = createGate();
    gate.querySelector("#hanaa-location-allow")?.addEventListener("click", requestLocation);
    requestLocation();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && document.getElementById(OVERLAY_ID) && !requesting) {
        requestLocation();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

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
      .hero-note,
      .hero-copy > p {
        display: none !important;
      }

      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        padding: 18px;
        background: #fff8f7;
        font-family: Arial, sans-serif;
      }
      #${OVERLAY_ID} .hanaa-location-card {
        width: min(360px, 100%);
        padding: 22px 20px;
        border: 1px solid #f0d6d8;
        border-radius: 20px;
        background: #fff;
        box-shadow: 0 18px 45px rgba(120, 0, 0, .10);
        text-align: center;
      }
      #${OVERLAY_ID} img {
        width: 92px;
        max-width: 32vw;
        height: auto;
        margin-bottom: 7px;
      }
      #${OVERLAY_ID} h1 {
        margin: 0 0 14px;
        color: #241516;
        font-size: 23px;
        line-height: 1.15;
      }
      #${OVERLAY_ID} button {
        width: 100%;
        min-height: 48px;
        padding: 12px 16px;
        border: 0;
        border-radius: 14px;
        color: #fff;
        background: #d71920;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }
      #${OVERLAY_ID} button:disabled { opacity: .7; cursor: wait; }
      #${OVERLAY_ID} .hanaa-location-error {
        min-height: 14px;
        margin-top: 9px;
        color: #c5161d;
        font-size: 11.5px;
        font-weight: 700;
      }
      @media (max-width: 520px) {
        #${OVERLAY_ID} { padding: 14px; }
        #${OVERLAY_ID} .hanaa-location-card { padding: 18px 16px; border-radius: 18px; }
        #${OVERLAY_ID} img { width: 72px; max-width: 26vw; margin-bottom: 5px; }
        #${OVERLAY_ID} h1 { font-size: 20px; margin-bottom: 12px; }
      }
    `;
    document.head.appendChild(style);
  };

  const createGate = () => {
    if (document.getElementById(OVERLAY_ID)) return document.getElementById(OVERLAY_ID);
    addStyles();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="hanaa-location-card">
        <img src="/hanaa-logo.png" alt="Hanaa Food" />
        <h1>Activez votre position</h1>
        <button type="button" id="hanaa-location-allow">📍 Autoriser</button>
        <div class="hanaa-location-error" id="hanaa-location-error"></div>
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

  const requestLocation = () => {
    const allowButton = document.getElementById("hanaa-location-allow");
    const errorBox = document.getElementById("hanaa-location-error");

    if (!navigator.geolocation) {
      if (errorBox) errorBox.textContent = "Localisation indisponible.";
      return;
    }

    if (allowButton) {
      allowButton.disabled = true;
      allowButton.textContent = "Un instant...";
    }
    if (errorBox) errorBox.textContent = "";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          sessionStorage.setItem("hanaa-location-authorized", "1");
          sessionStorage.setItem(
            "hanaa-location-last",
            JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              at: Date.now(),
            }),
          );
        } catch (_) {}
        removeGate();
      },
      (error) => {
        if (allowButton) {
          allowButton.disabled = false;
          allowButton.textContent = "📍 Réessayer";
        }
        if (!errorBox) return;
        if (error?.code === 1) {
          errorBox.textContent = "Activez la position puis réessayez.";
        } else if (error?.code === 3) {
          errorBox.textContent = "Réessayez.";
        } else {
          errorBox.textContent = "Position indisponible. Réessayez.";
        }
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 },
    );
  };

  const start = () => {
    addStyles();
    try {
      if (sessionStorage.getItem("hanaa-location-authorized") === "1") return;
    } catch (_) {}

    const gate = createGate();
    gate.querySelector("#hanaa-location-allow")?.addEventListener("click", requestLocation);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

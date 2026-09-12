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
        padding: 18px;
        background: #fff8f7;
        font-family: Arial, sans-serif;
      }
      #${OVERLAY_ID} .hanaa-location-card {
        width: min(390px, 100%);
        padding: 24px 20px;
        border: 1px solid #f0d6d8;
        border-radius: 22px;
        background: #fff;
        box-shadow: 0 18px 45px rgba(120, 0, 0, .10);
        text-align: center;
      }
      #${OVERLAY_ID} img {
        width: 100px;
        max-width: 34vw;
        height: auto;
        margin-bottom: 8px;
      }
      #${OVERLAY_ID} h1 {
        margin: 0 0 8px;
        color: #241516;
        font-size: 24px;
        line-height: 1.15;
      }
      #${OVERLAY_ID} p {
        margin: 0 auto 18px;
        max-width: 290px;
        color: #77686a;
        font-size: 13px;
        line-height: 1.45;
      }
      #${OVERLAY_ID} button {
        width: 100%;
        min-height: 50px;
        padding: 13px 16px;
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
        min-height: 16px;
        margin-top: 10px;
        color: #c5161d;
        font-size: 12px;
        font-weight: 700;
      }
      @media (max-width: 520px) {
        #${OVERLAY_ID} { padding: 14px; }
        #${OVERLAY_ID} .hanaa-location-card { padding: 20px 17px; border-radius: 18px; }
        #${OVERLAY_ID} img { width: 78px; max-width: 28vw; margin-bottom: 6px; }
        #${OVERLAY_ID} h1 { font-size: 21px; }
        #${OVERLAY_ID} p { font-size: 12.5px; margin-bottom: 15px; }
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
        <p>Pour voir le menu disponible près de chez vous.</p>
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
      if (errorBox) errorBox.textContent = "Localisation indisponible sur cet appareil.";
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
          errorBox.textContent = "Autorisation refusée. Activez la position puis réessayez.";
        } else if (error?.code === 3) {
          errorBox.textContent = "Ça prend trop de temps. Réessayez.";
        } else {
          errorBox.textContent = "Position indisponible. Réessayez.";
        }
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 },
    );
  };

  const start = () => {
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

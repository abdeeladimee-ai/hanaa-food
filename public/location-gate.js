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
        padding: 22px;
        background: #fff8f7;
        font-family: Arial, sans-serif;
      }
      #${OVERLAY_ID} .hanaa-location-card {
        width: min(430px, 100%);
        padding: 30px 24px;
        border: 1px solid #f0d6d8;
        border-radius: 24px;
        background: #fff;
        box-shadow: 0 20px 55px rgba(120, 0, 0, .10);
        text-align: center;
      }
      #${OVERLAY_ID} img {
        width: 120px;
        max-width: 45vw;
        height: auto;
        margin-bottom: 14px;
      }
      #${OVERLAY_ID} h1 {
        margin: 0 0 10px;
        color: #241516;
        font-size: 26px;
        line-height: 1.15;
      }
      #${OVERLAY_ID} p {
        margin: 0 auto 22px;
        max-width: 330px;
        color: #77686a;
        font-size: 14px;
        line-height: 1.55;
      }
      #${OVERLAY_ID} button {
        width: 100%;
        min-height: 52px;
        padding: 14px 18px;
        border: 0;
        border-radius: 14px;
        color: #fff;
        background: #d71920;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }
      #${OVERLAY_ID} button:disabled { opacity: .65; cursor: wait; }
      #${OVERLAY_ID} .hanaa-location-error {
        min-height: 18px;
        margin-top: 13px;
        color: #c5161d;
        font-size: 12px;
        font-weight: 700;
      }
      #${OVERLAY_ID} .hanaa-location-note {
        display: block;
        margin-top: 14px;
        color: #9b8b8d;
        font-size: 11px;
        line-height: 1.4;
      }
      @media (max-width: 520px) {
        #${OVERLAY_ID} { padding: 16px; }
        #${OVERLAY_ID} .hanaa-location-card { padding: 26px 19px; border-radius: 20px; }
        #${OVERLAY_ID} h1 { font-size: 23px; }
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
        <h1>Autorisez votre localisation</h1>
        <p>Pour afficher les produits disponibles, choisir le restaurant le plus proche et calculer votre livraison.</p>
        <button type="button" id="hanaa-location-allow">📍 Autoriser ma position</button>
        <div class="hanaa-location-error" id="hanaa-location-error"></div>
        <small class="hanaa-location-note">Votre position sert uniquement à préparer votre commande et calculer la distance de livraison.</small>
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

  const syncReactLocation = () => {
    let attempts = 0;
    const findAndClick = () => {
      attempts += 1;
      const button = Array.from(document.querySelectorAll("button")).find((item) =>
        (item.textContent || "").toLowerCase().includes("utiliser ma position actuelle"),
      );
      if (button) {
        button.click();
        setTimeout(removeGate, 250);
        return;
      }
      if (attempts < 60) {
        setTimeout(findAndClick, 100);
        return;
      }
      removeGate();
    };
    findAndClick();
  };

  const requestLocation = () => {
    const allowButton = document.getElementById("hanaa-location-allow");
    const errorBox = document.getElementById("hanaa-location-error");

    if (!navigator.geolocation) {
      if (errorBox) errorBox.textContent = "La localisation n'est pas disponible sur cet appareil.";
      return;
    }

    if (allowButton) {
      allowButton.disabled = true;
      allowButton.textContent = "Localisation en cours...";
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
        syncReactLocation();
      },
      () => {
        if (allowButton) {
          allowButton.disabled = false;
          allowButton.textContent = "📍 Réessayer et autoriser";
        }
        if (errorBox) {
          errorBox.textContent = "Localisation refusée. Autorisez-la dans votre navigateur puis réessayez.";
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const start = () => {
    const gate = createGate();
    gate.querySelector("#hanaa-location-allow")?.addEventListener("click", requestLocation);

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          if (permission.state === "granted") requestLocation();
        })
        .catch(() => {});
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

(() => {
  if (/^\/(admin|snack|livreur|login)(\/|$)/.test(window.location.pathname)) return;

  const BANNER_ID = "hanaa-ordering-paused-banner";
  const MESSAGE = "Les commandes sont temporairement indisponibles. Merci de réessayer plus tard.";
  let paused = true;
  let refreshTimer = null;

  const findCommanderButtons = () =>
    [...document.querySelectorAll("button")].filter((button) => {
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      return /^Commander\b/.test(label) || /^Confirmer la commande\b/.test(label);
    });

  const showBanner = () => {
    const navbar = document.querySelector(".navbar");
    if (!navbar || document.getElementById(BANNER_ID)) return;

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.style.cssText = [
      "margin:12px auto 0",
      "max-width:1180px",
      "padding:14px 18px",
      "border-radius:16px",
      "background:#fff1f1",
      "border:1px solid #f3c5c7",
      "color:#8f151b",
      "font-weight:800",
      "text-align:center",
      "box-sizing:border-box",
    ].join(";");
    banner.textContent = MESSAGE;
    navbar.insertAdjacentElement("afterend", banner);
  };

  const hideBanner = () => {
    document.getElementById(BANNER_ID)?.remove();
  };

  const syncUi = () => {
    if (paused) showBanner();
    else hideBanner();

    findCommanderButtons().forEach((button) => {
      if (paused) {
        if (!button.dataset.hanaaOrderingPaused) {
          button.dataset.hanaaOrderingPaused = "1";
          button.dataset.hanaaWasDisabled = button.disabled ? "1" : "0";
        }
        button.disabled = true;
        button.title = MESSAGE;
        button.setAttribute("aria-disabled", "true");
      } else if (button.dataset.hanaaOrderingPaused) {
        if (button.dataset.hanaaWasDisabled !== "1") button.disabled = false;
        button.removeAttribute("title");
        button.removeAttribute("aria-disabled");
        delete button.dataset.hanaaOrderingPaused;
        delete button.dataset.hanaaWasDisabled;
      }
    });
  };

  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/neon-settings", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok !== false) {
        paused = payload.paused === true;
        syncUi();
      }
    } catch {
      // Fail closed if the setting cannot be read while the restaurant is paused.
      paused = true;
      syncUi();
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!paused) return;
      const button = event.target.closest?.("button");
      if (!button) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^Commander\b/.test(label) && !/^Confirmer la commande\b/.test(label)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      window.alert(MESSAGE);
    },
    true,
  );

  const observer = new MutationObserver(syncUi);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("load", () => {
    syncUi();
    void refreshStatus();
  });
  window.addEventListener("popstate", () => setTimeout(syncUi, 0));

  syncUi();
  void refreshStatus();
  refreshTimer = window.setInterval(refreshStatus, 30000);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer != null) window.clearInterval(refreshTimer);
  });
})();

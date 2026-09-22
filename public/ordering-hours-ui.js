(() => {
  if (/^\/(admin|snack|livreur|login)(\/|$)/.test(window.location.pathname)) return;

  const BANNER_ID = "hanaa-ordering-paused-banner";
  const PAUSED = false;
  const MESSAGE = "Les commandes sont temporairement indisponibles. Merci de réessayer plus tard.";

  const findCommanderButtons = () =>
    [...document.querySelectorAll("button")].filter((button) => {
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      return /^Commander\b/.test(label) || /^Confirmer la commande\b/.test(label);
    });

  const showBanner = () => {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    let banner = document.getElementById(BANNER_ID);
    if (banner) return;

    banner = document.createElement("div");
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

  const syncUi = () => {
    if (!PAUSED) return;
    showBanner();

    findCommanderButtons().forEach((button) => {
      button.disabled = true;
      button.title = MESSAGE;
      button.setAttribute("aria-disabled", "true");
    });
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!PAUSED) return;
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
  window.addEventListener("load", syncUi);
  window.addEventListener("popstate", () => setTimeout(syncUi, 0));
  syncUi();
})();

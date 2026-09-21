(() => {
  if (/^\/(admin|snack|livreur|login)(\/|$)/.test(window.location.pathname)) return;

  const BANNER_ID = "hanaa-ordering-closed-banner";
  const TIME_ZONE = "UTC";
  const TEST_CLOSED = new URLSearchParams(window.location.search).get("testClosed") === "1";

  const getBusinessHour = () => {
    const hourPart = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .find((item) => item.type === "hour");

    return Number(hourPart?.value);
  };

  const isClosed = () => {
    if (TEST_CLOSED) return true;
    const hour = getBusinessHour();
    return Number.isFinite(hour) && hour >= 3 && hour < 12;
  };

  const findCommanderButtons = () =>
    [...document.querySelectorAll("button.primary-action.full")].filter((button) => {
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      return /^Commander\b/.test(label) && !/^Confirmer la commande\b/.test(label);
    });

  const removeBanner = () => document.getElementById(BANNER_ID)?.remove();

  const showBanner = () => {
    const navbar = document.querySelector(".navbar");
    if (!navbar) {
      removeBanner();
      return;
    }

    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
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
      banner.textContent = TEST_CLOSED
        ? "TEST · Commandes fermées de 03:00 à 12:00 · Réouverture automatique à 12:00"
        : "Commandes fermées de 03:00 à 12:00 · Réouverture automatique à 12:00";
      navbar.insertAdjacentElement("afterend", banner);
    }
  };

  const syncUi = () => {
    const closed = isClosed();

    if (closed) showBanner();
    else removeBanner();

    findCommanderButtons().forEach((button) => {
      if (closed) {
        if (button.dataset.orderHoursDisabled !== "1") {
          button.dataset.orderHoursDisabled = "1";
          button.disabled = true;
          button.title = "Réouverture à 12:00";
        }
      } else if (button.dataset.orderHoursDisabled === "1") {
        delete button.dataset.orderHoursDisabled;
        button.disabled = false;
        button.removeAttribute("title");
      }
    });
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!isClosed()) return;
      const button = event.target.closest?.("button");
      if (!button) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^Confirmer la commande\b/.test(label)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      window.alert("Commandes fermées de 03:00 à 12:00. Réouverture à 12:00.");
    },
    true,
  );

  const observer = new MutationObserver(syncUi);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", syncUi);
  window.addEventListener("popstate", () => setTimeout(syncUi, 0));
  window.setInterval(syncUi, 30000);
  syncUi();
})();

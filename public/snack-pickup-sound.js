(() => {
  const SOUND_PATH = "/sounds/glovo-tab-notification.mp3";
  const ENABLE_KEY = "hanaa-snack-sound-enabled";
  const REPEAT_MS = 10000;
  const audio = new Audio(SOUND_PATH);
  audio.preload = "auto";
  audio.volume = 1;

  let lastSoundAt = 0;
  let repeatTimer = null;

  const play = async () => {
    if (sessionStorage.getItem(ENABLE_KEY) !== "1") return;
    if (Date.now() - lastSoundAt < 2500) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      lastSoundAt = Date.now();
    } catch (error) {
      console.error("Snack notification sound blocked:", error);
    }
  };

  const parseFrDate = (text = "") => {
    const match = String(text)
      .trim()
      .match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);

    if (!match) return null;

    const [, day, month, year, hour, minute, second = "0"] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );

    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getStatusText = (card) =>
    (card.querySelector(".workflow-status")?.textContent || "").trim().toUpperCase();

  const isNewOrderCard = (card) => {
    const status = getStatusText(card);
    return status === "NOUVELLE" || status === "NOUVELLE COMMANDE";
  };

  const visibleNewCards = () =>
    [...document.querySelectorAll(".workflow-snack .workflow-card")].filter(isNewOrderCard);

  const noticeHasNewOrder = () => {
    const notice = document.querySelector(".workflow-snack .workflow-notification");
    const text = (notice?.textContent || "").toUpperCase();
    return text.includes("NOUVELLE COMMANDE") || text.includes("NOUVELLE LIVRAISON");
  };

  const hasPendingNewOrder = () => visibleNewCards().length > 0 || noticeHasNewOrder();

  const updateOrderTimers = () => {
    if (!document.querySelector(".workflow-snack")) return;

    document.querySelectorAll(".workflow-snack .workflow-card").forEach((card) => {
      const time = card.querySelector(".workflow-card-top time");
      if (!time) return;

      const createdAt = parseFrDate(time.textContent || "");
      if (!createdAt) return;

      const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
      let badge = card.querySelector(".snack-order-age");

      if (!badge) {
        badge = document.createElement("span");
        badge.className = "snack-order-age";
        time.insertAdjacentElement("afterend", badge);
      }

      badge.textContent = minutes < 1 ? "À L’INSTANT" : `IL Y A ${minutes} MIN`;

      card.classList.remove("snack-age-fresh", "snack-age-warn", "snack-age-urgent", "snack-order-new");

      if (minutes >= 10) card.classList.add("snack-age-urgent");
      else if (minutes >= 5) card.classList.add("snack-age-warn");
      else card.classList.add("snack-age-fresh");

      if (isNewOrderCard(card)) card.classList.add("snack-order-new");
    });
  };

  const manageRepeatAlert = () => {
    if (!document.querySelector(".workflow-snack")) {
      if (repeatTimer) clearInterval(repeatTimer);
      repeatTimer = null;
      return;
    }

    if (hasPendingNewOrder()) {
      if (!repeatTimer) {
        repeatTimer = setInterval(() => {
          if (hasPendingNewOrder()) void play();
          else {
            clearInterval(repeatTimer);
            repeatTimer = null;
          }
        }, REPEAT_MS);
      }
    } else if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;
    }
  };

  const refresh = () => {
    updateOrderTimers();
    manageRepeatAlert();
  };

  document.addEventListener(
    "click",
    async (event) => {
      const soundButton = event.target.closest?.(".workflow-sound");
      if (soundButton) {
        sessionStorage.setItem(ENABLE_KEY, "1");
        try {
          audio.muted = true;
          await audio.play();
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        } catch (_) {
          audio.muted = false;
        }
        setTimeout(refresh, 100);
        return;
      }

      const acceptButton = event.target.closest?.("button.workflow-accept");
      if (acceptButton && acceptButton.textContent.trim() === "ACCEPTER") {
        const noticeClose = document.querySelector(".workflow-snack .workflow-notification button");
        if (noticeClose) noticeClose.click();
        setTimeout(refresh, 1200);
      }
    },
    true,
  );

  let lastNotice = "";
  const checkImmediatePickupSound = () => {
    if (sessionStorage.getItem(ENABLE_KEY) !== "1") return;
    const notice = document.querySelector(".workflow-snack .workflow-notification");
    if (!notice) return;

    const text = (notice.textContent || "").replace("×", "").trim();
    if (!text || text === lastNotice) return;

    lastNotice = text;
    if (text.toUpperCase().includes("À EMPORTER")) void play();
  };

  const observer = new MutationObserver(() => {
    checkImmediatePickupSound();
    refresh();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("load", refresh);
  setInterval(refresh, 30000);
})();

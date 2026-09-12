(() => {
  const SNACK_SOUND = "/sounds/glovo-tab-notification.mp3";
  const DRIVER_SOUND = "/sounds/notificacion-glovo-app.mp3";
  const ENABLE_KEY = "hanaa-persistent-alert-enabled";

  let audio = null;
  let audioRole = null;
  let pendingStartedAt = 0;
  let wasPending = false;

  const getRole = () => {
    if (document.querySelector(".workflow-driver")) return "driver";
    if (document.querySelector(".workflow-snack")) return "snack";
    return null;
  };

  const ensureAudio = (role) => {
    const src = role === "driver" ? DRIVER_SOUND : SNACK_SOUND;

    if (!audio || audioRole !== role) {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = 1;
      audio.loop = true;
      audioRole = role;
    }

    return audio;
  };

  const stopAudio = () => {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };

  const startAudio = async (role) => {
    if (sessionStorage.getItem(ENABLE_KEY) !== "1") return;

    const player = ensureAudio(role);
    if (!player.paused) return;

    try {
      player.currentTime = 0;
      await player.play();
    } catch (error) {
      console.error("Persistent order alert blocked:", error);
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
    (card.querySelector(".workflow-status")?.textContent || "")
      .trim()
      .toUpperCase();

  const isNewSnackCard = (card) => {
    const status = getStatusText(card);
    return status === "NOUVELLE" || status === "NOUVELLE COMMANDE";
  };

  const snackHasVisiblePending = () =>
    [...document.querySelectorAll(".workflow-snack .workflow-card")].some(
      isNewSnackCard,
    );

  const snackNoticePending = () => {
    const notice = document.querySelector(
      ".workflow-snack .workflow-notification",
    );
    const text = (notice?.textContent || "").toUpperCase();

    return (
      text.includes("NOUVELLE COMMANDE LIVRAISON") ||
      text.includes("NOUVELLE COMMANDE À EMPORTER")
    );
  };

  const snackHasPending = () =>
    snackHasVisiblePending() || snackNoticePending();

  const driverHasPending = () =>
    [...document.querySelectorAll(".workflow-driver .driver-order-card")].some(
      (card) => {
        if (card.classList.contains("driver-active-card")) return false;

        return [...card.querySelectorAll("button")].some(
          (button) =>
            (button.textContent || "").trim().toUpperCase() === "ACCEPTER",
        );
      },
    );

  const hasPending = (role) => {
    if (role === "snack") return snackHasPending();
    if (role === "driver") return driverHasPending();
    return false;
  };

  const updateSnackTimers = () => {
    if (!document.querySelector(".workflow-snack")) return;

    document
      .querySelectorAll(".workflow-snack .workflow-card")
      .forEach((card) => {
        const time = card.querySelector(".workflow-card-top time");
        if (!time) return;

        const createdAt = parseFrDate(time.textContent || "");
        if (!createdAt) return;

        const minutes = Math.max(
          0,
          Math.floor((Date.now() - createdAt.getTime()) / 60000),
        );

        let badge = card.querySelector(".snack-order-age");
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "snack-order-age";
          time.insertAdjacentElement("afterend", badge);
        }

        badge.textContent =
          minutes < 1 ? "À L’INSTANT" : `IL Y A ${minutes} MIN`;

        card.classList.remove(
          "snack-age-fresh",
          "snack-age-warn",
          "snack-age-urgent",
          "snack-order-new",
        );

        if (minutes >= 10) card.classList.add("snack-age-urgent");
        else if (minutes >= 5) card.classList.add("snack-age-warn");
        else card.classList.add("snack-age-fresh");

        if (isNewSnackCard(card)) card.classList.add("snack-order-new");
      });
  };

  const syncAlert = () => {
    updateSnackTimers();

    const role = getRole();
    if (!role) {
      wasPending = false;
      pendingStartedAt = 0;
      stopAudio();
      return;
    }

    const pending = hasPending(role);

    if (!pending) {
      wasPending = false;
      pendingStartedAt = 0;
      stopAudio();
      return;
    }

    if (!wasPending) {
      wasPending = true;
      pendingStartedAt = Date.now();
    }

    // React plays the first alert immediately. If it is still not confirmed,
    // continue ringing after a short delay and keep looping until acceptance.
    if (Date.now() - pendingStartedAt >= 3000) {
      void startAudio(role);
    }
  };

  document.addEventListener(
    "click",
    async (event) => {
      const soundButton = event.target.closest?.(".workflow-sound");
      if (soundButton) {
        sessionStorage.setItem(ENABLE_KEY, "1");

        const role = getRole() || "snack";
        const player = ensureAudio(role);

        try {
          player.loop = false;
          player.muted = true;
          await player.play();
          player.pause();
          player.currentTime = 0;
          player.muted = false;
          player.loop = true;
        } catch (_) {
          player.muted = false;
          player.loop = true;
        }

        setTimeout(syncAlert, 100);
        return;
      }

      const acceptButton = event.target.closest?.("button.workflow-accept");
      if (
        acceptButton &&
        (acceptButton.textContent || "").trim().toUpperCase() === "ACCEPTER"
      ) {
        stopAudio();
        wasPending = false;
        pendingStartedAt = 0;
        setTimeout(syncAlert, 1200);
        return;
      }

      const closeButton = event.target.closest?.(
        ".workflow-notification button",
      );
      const role = getRole();

      if (closeButton && role && hasPending(role)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  const observer = new MutationObserver(syncAlert);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("load", syncAlert);
  window.addEventListener("beforeunload", stopAudio);
  setInterval(syncAlert, 800);
})();

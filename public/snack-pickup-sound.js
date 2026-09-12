(() => {
  const SOUND_PATH = "/sounds/glovo-tab-notification.mp3";
  const ENABLE_KEY = "hanaa-snack-sound-enabled";
  const SEEN_NOTIFICATION_KEY = "hanaa-last-pickup-notification";
  const audio = new Audio(SOUND_PATH);
  audio.preload = "auto";
  audio.volume = 1;

  const play = async () => {
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.error("Pickup notification sound blocked:", error);
    }
  };

  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.(".workflow-sound");
    if (!button) return;

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
  }, true);

  let lastText = sessionStorage.getItem(SEEN_NOTIFICATION_KEY) || "";

  const checkPickupNotification = () => {
    if (!document.querySelector(".workflow-snack")) return;
    if (sessionStorage.getItem(ENABLE_KEY) !== "1") return;

    const notice = document.querySelector(".workflow-notification");
    if (!notice) return;

    const text = (notice.textContent || "").replace("×", "").trim();
    const isPickup = text.includes("NOUVELLE COMMANDE À EMPORTER");
    if (!isPickup || !text || text === lastText) return;

    lastText = text;
    sessionStorage.setItem(SEEN_NOTIFICATION_KEY, text);
    void play();
  };

  const observer = new MutationObserver(() => {
    checkPickupNotification();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("load", checkPickupNotification);
})();

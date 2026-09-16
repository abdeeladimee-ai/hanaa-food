(() => {
  const PROFILE_KEY = "hanaa-client-profile";
  const ORDER_IDS_KEY = "hanaa-client-order-ids";
  const ORDER_IDS_BY_PHONE_KEY = "hanaa-client-order-ids-by-phone";
  const PENDING_ORDER_KEY = "hanaa-profile-required-order";

  if (/^\/(admin|snack|livreur|login)(\/|$)/.test(window.location.pathname)) return;

  const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const compactPhone = (value) => String(value || "").replace(/[ .-]/g, "").trim();
  const phoneIsValid = (value) => /^(0[67]\d{8}|\+212[67]\d{8})$/.test(compactPhone(value));

  const profilePhoneKey = (profile) => {
    const phone = compactPhone(profile?.phone);
    if (!phoneIsValid(phone)) return "";
    if (phone.startsWith("+212")) return `0${phone.slice(4)}`;
    return phone;
  };

  const readProfile = () => {
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return profile && typeof profile === "object" ? profile : {};
    } catch {
      return {};
    }
  };

  const profileIsValid = (profile = readProfile()) =>
    Boolean(cleanText(profile?.name)) && phoneIsValid(profile?.phone);

  const readOrderIds = () => {
    try {
      const ids = JSON.parse(localStorage.getItem(ORDER_IDS_KEY) || "[]");
      return Array.isArray(ids)
        ? [...new Set(ids.map((id) => cleanText(id)).filter(Boolean))].slice(-50)
        : [];
    } catch {
      return [];
    }
  };

  const writeOrderIds = (ids) => {
    localStorage.setItem(
      ORDER_IDS_KEY,
      JSON.stringify([...new Set((ids || []).map((id) => cleanText(id)).filter(Boolean))].slice(-50)),
    );
  };

  const readOrderMap = () => {
    try {
      const map = JSON.parse(localStorage.getItem(ORDER_IDS_BY_PHONE_KEY) || "{}");
      return map && typeof map === "object" && !Array.isArray(map) ? map : {};
    } catch {
      return {};
    }
  };

  const writeOrderMap = (map) =>
    localStorage.setItem(ORDER_IDS_BY_PHONE_KEY, JSON.stringify(map || {}));

  const idsForPhone = (map, phoneKey) => {
    const ids = map?.[phoneKey];
    return Array.isArray(ids)
      ? [...new Set(ids.map((id) => cleanText(id)).filter(Boolean))].slice(-50)
      : [];
  };

  const setActiveProfileOrderIds = () => {
    const profile = readProfile();
    const phoneKey = profilePhoneKey(profile);
    if (!profileIsValid(profile) || !phoneKey) return;

    const map = readOrderMap();
    writeOrderIds(idsForPhone(map, phoneKey));
  };

  const mergeCurrentOrderIdsIntoProfile = () => {
    const profile = readProfile();
    const phoneKey = profilePhoneKey(profile);
    if (!profileIsValid(profile) || !phoneKey) return;

    const map = readOrderMap();
    const merged = [...new Set([...idsForPhone(map, phoneKey), ...readOrderIds()])].slice(-50);
    map[phoneKey] = merged;
    writeOrderMap(map);
  };

  let lastProfilePhone = profilePhoneKey(readProfile());

  const migrateExistingProfile = () => {
    const profile = readProfile();
    const phoneKey = profilePhoneKey(profile);
    if (!profileIsValid(profile) || !phoneKey) return;

    const map = readOrderMap();
    if (!Array.isArray(map[phoneKey])) {
      map[phoneKey] = readOrderIds();
      writeOrderMap(map);
    }
    writeOrderIds(idsForPhone(map, phoneKey));
  };

  const findButton = (predicate) =>
    [...document.querySelectorAll("button")].find((button) => predicate(cleanText(button.textContent), button));

  const goToProfile = () => {
    sessionStorage.setItem(PENDING_ORDER_KEY, "1");
    window.alert("Qbel ma tkemmel commande, 3ammer Nom w Téléphone f Mon profil.");

    const accountButton = findButton((label) => label === "Mon compte") ||
      findButton((label) => label === "Profil");

    if (!accountButton) return;
    accountButton.click();

    window.setTimeout(() => {
      const profileButton = findButton((label) => label.includes("Mon profil"));
      profileButton?.click();
    }, 80);
  };

  const continuePendingOrder = () => {
    if (sessionStorage.getItem(PENDING_ORDER_KEY) !== "1") return;
    sessionStorage.removeItem(PENDING_ORDER_KEY);

    const cartButton = document.querySelector(".nav-cart") ||
      findButton((label) => label.startsWith("Panier"));
    cartButton?.click();

    window.setTimeout(() => {
      const commander = findButton((label) => /^Commander\b/.test(label));
      if (commander && !commander.disabled) commander.click();
    }, 120);
  };

  const addRequiredNote = () => {
    const profileTitle = [...document.querySelectorAll("h1")].find(
      (node) => cleanText(node.textContent) === "Mon profil",
    );
    if (!profileTitle || document.getElementById("hanaa-profile-required-note")) return;

    const container = profileTitle.parentElement;
    if (!container) return;

    const note = document.createElement("div");
    note.id = "hanaa-profile-required-note";
    note.style.cssText = [
      "margin-top:12px",
      "padding:12px 14px",
      "border-radius:12px",
      "background:#fff1f1",
      "border:1px solid #f3c5c7",
      "color:#8f151b",
      "font-weight:800",
      "line-height:1.4",
    ].join(";");
    note.textContent = "Obligatoire pour commander · Remplis ton nom et ton téléphone une seule fois.";
    container.appendChild(note);
  };

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("button");
      if (!button) return;
      const label = cleanText(button.textContent);

      if (/^(Commander|Confirmer la commande)\b/.test(label) && !profileIsValid()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        goToProfile();
        return;
      }

      if (/\bCommandes\b/i.test(label) || /Mes commandes/i.test(label)) {
        mergeCurrentOrderIdsIntoProfile();
        setActiveProfileOrderIds();
      }
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const page = form.closest("main");
      const title = page?.querySelector("h1");
      if (cleanText(title?.textContent) !== "Mon profil") return;

      const previousPhone = lastProfilePhone;
      window.setTimeout(() => {
        const profile = readProfile();
        if (!profileIsValid(profile)) return;

        const nextPhone = profilePhoneKey(profile);
        const map = readOrderMap();

        if (!Array.isArray(map[nextPhone])) {
          map[nextPhone] = !previousPhone || previousPhone === nextPhone ? readOrderIds() : [];
        } else if (previousPhone === nextPhone) {
          map[nextPhone] = [...new Set([...idsForPhone(map, nextPhone), ...readOrderIds()])].slice(-50);
        }

        writeOrderMap(map);
        writeOrderIds(idsForPhone(map, nextPhone));
        lastProfilePhone = nextPhone;
        continuePendingOrder();
      }, 80);
    },
    true,
  );

  const observer = new MutationObserver(addRequiredNote);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  migrateExistingProfile();
  addRequiredNote();
  window.setInterval(mergeCurrentOrderIdsIntoProfile, 2000);
})();

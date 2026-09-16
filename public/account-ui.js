(() => {
  if (/^\/(admin|snack|livreur|login)(\/|$)/.test(window.location.pathname)) return;

  const PROFILE_KEY = "hanaa-client-profile";
  const STYLE_ID = "hanaa-account-ui-style";
  const CARD_ID = "hanaa-account-profile-card";

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const readProfile = () => {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };

  const formatPhone = (value) => {
    const phone = clean(value).replace(/[ .-]/g, "");
    if (/^0[67]\d{8}$/.test(phone)) {
      return phone.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
    }
    if (/^\+212[67]\d{8}$/.test(phone)) {
      return phone.replace(/^(\+212)(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5 $6");
    }
    return clean(value);
  };

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .hanaa-account-page { max-width: 760px !important; }
      .hanaa-account-page .page-title { margin-bottom: 14px !important; }
      #${CARD_ID} {
        display:flex; align-items:center; gap:16px; padding:18px;
        border-radius:22px; background:linear-gradient(135deg,#fff 0%,#fff7f7 100%);
        border:1px solid #f2d9db; box-shadow:0 12px 30px rgba(82,20,24,.08);
        margin:10px 0 18px;
      }
      #${CARD_ID} .hanaa-avatar {
        width:58px; height:58px; min-width:58px; border-radius:18px;
        display:grid; place-items:center; background:#D71920; color:#fff;
        font-size:24px; font-weight:950; box-shadow:0 8px 20px rgba(215,25,32,.22);
      }
      #${CARD_ID} .hanaa-account-copy { min-width:0; }
      #${CARD_ID} .hanaa-account-name {
        font-size:20px; line-height:1.15; font-weight:950; color:#2f1719;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      #${CARD_ID} .hanaa-account-phone {
        margin-top:5px; color:#8d7476; font-size:14px; font-weight:700;
      }
      .hanaa-account-page .account-list {
        display:grid !important; gap:12px !important; margin-top:0 !important;
      }
      .hanaa-account-page .account-list > button {
        width:100% !important; min-height:78px; padding:15px 16px !important;
        border:1px solid #eee1e2 !important; border-radius:18px !important;
        background:#fff !important; box-shadow:0 7px 22px rgba(60,20,24,.055) !important;
        display:flex !important; align-items:center !important; gap:14px !important;
        text-align:left !important; color:#2f1719 !important;
        transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;
      }
      .hanaa-account-page .account-list > button:hover {
        transform:translateY(-1px); border-color:#ecc8cb !important;
        box-shadow:0 10px 26px rgba(60,20,24,.085) !important;
      }
      .hanaa-account-page .hanaa-account-icon {
        width:46px; height:46px; min-width:46px; border-radius:14px;
        display:grid; place-items:center; background:#fff0f1; color:#D71920;
        font-size:21px; font-weight:900;
      }
      .hanaa-account-page .hanaa-account-text { flex:1; min-width:0; }
      .hanaa-account-page .hanaa-account-title { font-size:16px; font-weight:950; }
      .hanaa-account-page .hanaa-account-subtitle {
        margin-top:4px; font-size:12.5px; line-height:1.3; color:#9a8385; font-weight:650;
      }
      .hanaa-account-page .hanaa-account-arrow {
        color:#D71920; font-size:22px; font-weight:900; padding-left:6px;
      }
      @media (max-width: 560px) {
        #${CARD_ID} { padding:16px; border-radius:18px; }
        #${CARD_ID} .hanaa-avatar { width:52px; height:52px; min-width:52px; border-radius:16px; }
        .hanaa-account-page .account-list > button { min-height:72px; border-radius:16px !important; }
      }
    `;
    document.head.appendChild(style);
  };

  const buttonConfig = (label) => {
    if (/Mes commandes/i.test(label)) {
      return { icon: "🧾", title: "Mes commandes", subtitle: "Suis tes commandes et retrouve ton historique" };
    }
    if (/Mes favoris/i.test(label)) {
      return { icon: "♡", title: "Mes favoris", subtitle: "Retrouve rapidement tes plats préférés" };
    }
    if (/Mon profil/i.test(label)) {
      return { icon: "♙", title: "Mon profil", subtitle: "Modifie ton nom et ton numéro de téléphone" };
    }
    return null;
  };

  const decorateAccount = () => {
    const list = document.querySelector(".account-list");
    if (!list) return;

    const main = list.closest("main");
    if (!main) return;

    ensureStyles();
    main.classList.add("hanaa-account-page");

    const profile = readProfile();
    const name = clean(profile.name);
    const phone = formatPhone(profile.phone);
    const displayName = name || "Bienvenue chez Hanaa Food";
    const initial = (name || "H").charAt(0).toUpperCase();

    let card = document.getElementById(CARD_ID);
    if (!card) {
      card = document.createElement("section");
      card.id = CARD_ID;
      const pageTitle = main.querySelector(".page-title");
      if (pageTitle) pageTitle.insertAdjacentElement("afterend", card);
      else main.insertBefore(card, list);
    }

    card.innerHTML = `
      <div class="hanaa-avatar" aria-hidden="true">${initial}</div>
      <div class="hanaa-account-copy">
        <div class="hanaa-account-name">${displayName.replace(/[<>]/g, "")}</div>
        <div class="hanaa-account-phone">${phone ? phone.replace(/[<>]/g, "") : "Ton espace personnel Hanaa Food"}</div>
      </div>
    `;

    [...list.querySelectorAll(":scope > button")].forEach((button) => {
      const currentLabel = clean(button.textContent);
      const config = buttonConfig(currentLabel);
      if (!config || button.dataset.hanaaAccountDecorated === "1") return;

      button.dataset.hanaaAccountDecorated = "1";
      button.innerHTML = `
        <span class="hanaa-account-icon" aria-hidden="true">${config.icon}</span>
        <span class="hanaa-account-text">
          <span class="hanaa-account-title">${config.title}</span>
          <span class="hanaa-account-subtitle">${config.subtitle}</span>
        </span>
        <span class="hanaa-account-arrow" aria-hidden="true">›</span>
      `;
    });
  };

  const observer = new MutationObserver(decorateAccount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", decorateAccount);
  window.addEventListener("storage", decorateAccount);
  document.addEventListener("submit", () => window.setTimeout(decorateAccount, 120), true);
  decorateAccount();
})();

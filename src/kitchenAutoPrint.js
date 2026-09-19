import { getOrder } from "./ordersApi";
import { configureQzSecurity } from "./qzSecurity";

const QZ_SCRIPT_URL = "/qz-tray.js";
const PRINTED_PREFIX = "hanaa-kitchen-printed:";
const DEFAULT_PRINTER_HINT = "imp cuisine";
const AMGALA_COLD_PRINTER_HINT = "froid";
const AMGALA_HOT_PRINTER_HINT = "chaud";
const MAX_ACCEPT_AGE_MS = 15 * 60 * 1000;
const inFlight = new Set();
const retryAfter = new Map();
const RETRY_COOLDOWN_MS = 30000;
let qzScriptPromise = null;
const QZ_GLOBAL_CONNECT_KEY = "__hanaaQzConnectPromise";
let scanScheduled = false;

const CATEGORY_RANGES = [
  [1, 5, "SALADES"],
  [6, 11, "PATES"],
  [12, 25, "PIZZAS"],
  [26, 31, "PASTICCIOS"],
  [32, 36, "TAPAS"],
  [37, 41, "WRAPS"],
  [42, 44, "GRILLADES"],
  [45, 52, "PLATS"],
  [53, 68, "BURGERS"],
  [69, 73, "SANDWICHS CLASSIQUES"],
  [74, 97, "SANDWICHS SPECIAUX"],
  [98, 104, "TACOS CLASSIQUES"],
  [105, 107, "MINI TACOS"],
  [108, 117, "TACOS SPECIAUX"],
  [118, 124, "BOWLS"],
  [125, 139, "JUS"],
  [140, 143, "SUPPLEMENT JUS"],
  [144, 147, "DESSERTS"],
  [148, 162, "SUPPLEMENTS"],
  [163, 169, "BOISSONS"],
];

const CATEGORY_LABELS = {
  salades: "SALADES",
  pates: "PATES",
  pizzas: "PIZZAS",
  pasticcios: "PASTICCIOS",
  tapas: "TAPAS",
  wraps: "WRAPS",
  grillades: "GRILLADES",
  plats: "PLATS",
  burgers: "BURGERS",
  "sandwichs-classiques": "SANDWICHS CLASSIQUES",
  "sandwichs-speciaux": "SANDWICHS SPECIAUX",
  "tacos-classiques": "TACOS CLASSIQUES",
  "mini-tacos": "MINI TACOS",
  "tacos-speciaux": "TACOS SPECIAUX",
  bowls: "BOWLS",
  jus: "JUS",
  "supplement-jus": "SUPPLEMENT JUS",
  desserts: "DESSERTS",
  supplements: "SUPPLEMENTS",
  boissons: "BOISSONS",
};

const AMGALA_COLD_CATEGORIES = new Set([
  "SALADES",
  "JUS",
  "SUPPLEMENT JUS",
  "DESSERTS",
  "BOISSONS",
]);

function isSnackPage() {
  return typeof window !== "undefined" && window.location.pathname === "/snack";
}

function clean(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


const BRANCH_NAMES = {
  tadart: "HANAA FOOD TADART",
  amgala: "HANAA FOOD AMGALA",
  "rue-baghdad": "HANAA FOOD BAGHDAD",
};

function branchName(order) {
  const id = String(order?.branchId || "").trim().toLowerCase();
  return clean(order?.branchName || BRANCH_NAMES[id] || "HANAA FOOD").toUpperCase();
}

function kitchenTime(order) {
  const raw = order?.cashierAcceptedAt || order?.createdAt || Date.now();
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function detailText(value) {
  if (value == null || value === "" || value === false) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item);
        if (item && typeof item === "object") return item.name || item.label || item.title || "";
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, item]) => item !== false && item != null && item !== "")
      .map(([key, item]) => `${key}: ${detailText(item)}`)
      .filter(Boolean)
      .join(" | ");
  }
  return String(value);
}

function itemDetails(item) {
  const candidates = [
    ["Taille", item.selectedSize ?? item.size],
    ["Variante", item.selectedVariant ?? item.variant],
    ["Pate", item.pastaVariant ?? item.pasta],
    ["Sauce", item.selectedSauce ?? item.sauce],
    ["Sauces", item.selectedSauces ?? item.sauces],
    ["Accompagnements", item.selectedAccompaniments ?? item.accompaniments],
    ["Supplements", item.selectedExtras ?? item.extras ?? item.supplements],
    ["Options", item.options],
  ];

  return candidates
    .map(([label, value]) => {
      const text = detailText(value);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);
}

function categoryLabel(item) {
  const direct =
    item.categoryId || item.subcategoryId || item.category || item.categoryName || "";
  const normalized = String(direct).trim().toLowerCase();
  if (CATEGORY_LABELS[normalized]) return CATEGORY_LABELS[normalized];

  const productId = Number(item.productId ?? item.id);
  if (Number.isFinite(productId)) {
    const range = CATEGORY_RANGES.find(
      ([start, end]) => productId >= start && productId <= end,
    );
    if (range) return range[2];
  }

  return "ARTICLES";
}

function groupItemsByCategory(items) {
  const groups = new Map();

  items.forEach((item) => {
    const category = categoryLabel(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });

  return [...groups.entries()];
}

function splitAmgalaItems(items) {
  const cold = [];
  const hot = [];

  items.forEach((item) => {
    if (AMGALA_COLD_CATEGORIES.has(categoryLabel(item))) cold.push(item);
    else hot.push(item);
  });

  return { cold, hot };
}

function isAmgalaOrder(order) {
  const branchId = String(order?.branchId || "").trim().toLowerCase();
  const branchName = String(order?.branchName || "").trim().toLowerCase();
  return branchId === "amgala" || branchName.includes("amgala");
}

function acceptedAt(order) {
  if (order.cashierAcceptedAt) return new Date(order.cashierAcceptedAt).getTime();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const accepted = [...history]
    .reverse()
    .find((entry) =>
      ["ACCEPTÉE PAR LE CAISSIER", "VALIDÉE PAR LE SNACK"].includes(entry?.status),
    );
  return accepted?.at ? new Date(accepted.at).getTime() : NaN;
}

function loadQz() {
  if (window.qz) return Promise.resolve(window.qz);
  if (qzScriptPromise) return qzScriptPromise;

  qzScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QZ_SCRIPT_URL}"]`);

    if (existing) {
      if (window.qz) {
        resolve(window.qz);
        return;
      }

      existing.addEventListener("load", () => resolve(window.qz), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Impossible de charger QZ Tray.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = QZ_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(window.qz);
    script.onerror = () => reject(new Error("Impossible de charger QZ Tray."));
    document.head.appendChild(script);
  });

  return qzScriptPromise;
}

async function getQz() {
  const qz = await loadQz();
  if (!qz) throw new Error("QZ Tray n'est pas disponible.");
  const securityConfiguredNow = configureQzSecurity(qz);
  if (securityConfiguredNow && qz.websocket.isActive()) {
    try {
      await qz.websocket.disconnect();
    } catch {
      // Reconnect below with the trusted certificate.
    }
  }
  if (qz.websocket.isActive()) return qz;

  if (!window[QZ_GLOBAL_CONNECT_KEY]) {
    window[QZ_GLOBAL_CONNECT_KEY] = qz.websocket
      .connect({ retries: 3, delay: 1 })
      .finally(() => {
        window[QZ_GLOBAL_CONNECT_KEY] = null;
      });
  }

  await window[QZ_GLOBAL_CONNECT_KEY];
  return qz;
}

function findPrinter(printers, hint) {
  if (!Array.isArray(printers)) return null;

  const exact = printers.find(
    (name) => String(name).trim().toLowerCase() === hint.toLowerCase(),
  );
  if (exact) return exact;

  return (
    printers.find((name) =>
      String(name).toLowerCase().includes(hint.toLowerCase()),
    ) || null
  );
}

function buildKitchenTicket(order, ticketItems = null, stationLabel = "") {
  const ESC = "\x1B";
  const GS = "\x1D";
  const separator = "------------------------------------------\n";
  const lines = [ESC + "@", ESC + "a" + "\x01"];
  const typeLabel = order.orderType === "pickup" ? "A EMPORTER" : "LIVRAISON";

  lines.push(ESC + "E" + "\x01", "HANAA FOOD - CUISINE\n", ESC + "E" + "\x00");
  lines.push(branchName(order) + "\n");

  if (stationLabel) {
    lines.push(ESC + "E" + "\x01");
    lines.push("[" + clean(stationLabel).toUpperCase() + "]\n");
    lines.push(ESC + "E" + "\x00");
  }

  lines.push(separator);

  lines.push(ESC + "!" + "\x10", ESC + "E" + "\x01");
  lines.push("#" + clean(order.id) + "  -  " + typeLabel + "\n");
  lines.push(ESC + "!" + "\x00", ESC + "E" + "\x00");
  lines.push(kitchenTime(order) + "\n");

  lines.push(separator, ESC + "a" + "\x00");

  const items = Array.isArray(ticketItems)
    ? ticketItems
    : Array.isArray(order.items)
      ? order.items
      : [];

  const groups = groupItemsByCategory(items);

  groups.forEach(([category, categoryItems], groupIndex) => {
    if (groupIndex > 0) lines.push(separator);

    lines.push(ESC + "a" + "\x01", ESC + "E" + "\x01");
    lines.push("*** " + clean(category) + " ***\n");
    lines.push(ESC + "E" + "\x00", ESC + "a" + "\x00", "\n");

    categoryItems.forEach((item, itemIndex) => {
      const qty = Number(item.quantity || 1);
      const name = clean(item.name || item.title || "Produit");

      lines.push(ESC + "E" + "\x01", ESC + "!" + "\x10");
      lines.push(qty + " X " + name + "\n");
      lines.push(ESC + "!" + "\x00", ESC + "E" + "\x00");

      itemDetails(item).forEach((detail) => {
        lines.push("   > " + clean(detail) + "\n");
      });

      if (itemIndex < categoryItems.length - 1) lines.push("\n");
    });
  });

  if (order.notes || order.note) {
    lines.push(separator);
    lines.push(ESC + "a" + "\x01", ESC + "E" + "\x01");
    lines.push("NOTE CUISINE\n");
    lines.push(ESC + "E" + "\x00", ESC + "a" + "\x00");
    lines.push(ESC + "!" + "\x10");
    lines.push(clean(order.notes || order.note) + "\n");
    lines.push(ESC + "!" + "\x00");
  }

  lines.push(separator);
  lines.push(ESC + "a" + "\x01", ESC + "E" + "\x01");
  lines.push("A PREPARER\n");
  lines.push(ESC + "E" + "\x00");
  lines.push("\n\n\n");
  lines.push(GS + "V" + "\x41" + "\x00");

  return lines;
}

async function printKitchenOrder(orderId, { required = false } = {}) {
  if (!orderId) {
    if (required) throw new Error("ID commande cuisine manquant.");
    return [];
  }
  if (inFlight.has(orderId)) {
    if (required) throw new Error("Impression cuisine deja en cours.");
    return [];
  }

  const nextRetryAt = retryAfter.get(orderId) || 0;
  if (!required && Date.now() < nextRetryAt) return [];

  const printedKey = `${PRINTED_PREFIX}${orderId}`;
  if (required) {
    localStorage.removeItem(printedKey);
  } else if (localStorage.getItem(printedKey)) {
    return ["already-printed"];
  }

  inFlight.add(orderId);

  try {
    const order = await getOrder(orderId);
    if (!order) return;

    const acceptedTime = acceptedAt(order);
    if (!Number.isFinite(acceptedTime) || Date.now() - acceptedTime > MAX_ACCEPT_AGE_MS) {
      return;
    }

    const qz = await getQz();
    const printers = await qz.printers.find();
    if (!Array.isArray(printers) || !printers.length) {
      throw new Error("Aucune imprimante cuisine detectee.");
    }

    const printedOn = [];

    if (isAmgalaOrder(order)) {
      const items = Array.isArray(order.items) ? order.items : [];
      const hotPrinter = findPrinter(printers, AMGALA_HOT_PRINTER_HINT);

      if (!hotPrinter) {
        throw new Error("Imprimante cuisine 'chaud' introuvable.");
      }

      const hotConfig = qz.configs.create(hotPrinter, { encoding: "CP858" });
      await qz.print(hotConfig, buildKitchenTicket(order, items, "CHAUD"));
      printedOn.push(hotPrinter);
    } else {
      const printer = findPrinter(printers, DEFAULT_PRINTER_HINT);
      if (!printer) throw new Error("Imprimante cuisine 'imp cuisine' introuvable.");
      const config = qz.configs.create(printer, { encoding: "CP858" });
      await qz.print(config, buildKitchenTicket(order));
      printedOn.push(printer);
    }

    if (!printedOn.length) throw new Error("Aucun article cuisine a imprimer.");

    localStorage.setItem(printedKey, new Date().toISOString());
    retryAfter.delete(orderId);
    console.info(`Ticket cuisine #${orderId} imprime sur ${printedOn.join(" + ")}.`);
    return printedOn;
  } catch (error) {
    retryAfter.set(orderId, Date.now() + RETRY_COOLDOWN_MS);
    console.error(`Impression cuisine impossible pour #${orderId}:`, error);
    if (required) throw error;
    return [];
  } finally {
    inFlight.delete(orderId);
  }
}

function scanAcceptedOrders() {
  scanScheduled = false;
  if (!isSnackPage()) return;

  document.querySelectorAll(".workflow-snack .workflow-card").forEach((card) => {
    const status =
      card.querySelector(".workflow-card-top .workflow-status")?.textContent?.trim() || "";

    if (!["ACCEPTÉE PAR LE CAISSIER", "VALIDÉE PAR LE SNACK"].includes(status)) {
      return;
    }

    const rawId = card.querySelector(".workflow-card-top b")?.textContent || "";
    const orderId = rawId.replace(/^#/, "").trim();
    if (orderId) void printKitchenOrder(orderId);
  });
}

function scheduleScan() {
  if (!isSnackPage() || scanScheduled) return;
  scanScheduled = true;
  window.requestAnimationFrame(scanAcceptedOrders);
}

if (typeof window !== "undefined") {
  window.__hanaaPrintKitchenOrder = (orderId) =>
    printKitchenOrder(orderId, { required: true });
}

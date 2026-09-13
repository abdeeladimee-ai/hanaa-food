import { getOrder } from "./ordersApi";

const MODE_KEY = "hanaa-kitchen-mode";
const PRINTED_PREFIX = "hanaa-kitchen-printed:";
const PRINTER_HINT = "chaud";
const MAX_ACCEPT_AGE_MS = 15 * 60 * 1000;
const inFlight = new Set();
let connectPromise = null;

function kitchenModeEnabled() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("kitchen") === "1") {
    localStorage.setItem(MODE_KEY, "1");
  }
  return window.location.pathname === "/snack" && localStorage.getItem(MODE_KEY) === "1";
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

async function getQz() {
  const qz = window.qz;
  if (!qz) throw new Error("QZ Tray JavaScript ma tchargach.");
  if (qz.websocket.isActive()) return qz;

  if (!connectPromise) {
    connectPromise = qz.websocket
      .connect({ retries: 2, delay: 1 })
      .finally(() => {
        connectPromise = null;
      });
  }
  await connectPromise;
  return qz;
}

async function findKitchenPrinter(qz) {
  const printers = await qz.printers.find();
  if (!Array.isArray(printers)) return null;
  const exact = printers.find(
    (name) => String(name).trim().toLowerCase() === PRINTER_HINT,
  );
  if (exact) return exact;
  return (
    printers.find((name) =>
      String(name).toLowerCase().includes(PRINTER_HINT),
    ) || null
  );
}

function buildKitchenTicket(order) {
  const ESC = "\x1B";
  const GS = "\x1D";
  const separator = "------------------------------------------\n";
  const lines = [ESC + "@", ESC + "a" + "\x01", ESC + "E" + "\x01"];

  lines.push("HANAA FOOD\n", "CUISINE\n");
  lines.push(ESC + "E" + "\x00");
  if (order.branchName) lines.push(`${clean(order.branchName)}\n`);
  lines.push(separator);
  lines.push(ESC + "!" + "\x30", `#${clean(order.id)}\n`, ESC + "!" + "\x00");
  lines.push(`${order.orderType === "pickup" ? "A EMPORTER" : "LIVRAISON"}\n`);
  lines.push(`${new Date(order.createdAt || Date.now()).toLocaleString("fr-FR")}\n`);
  lines.push(separator, ESC + "a" + "\x00");

  (order.items || []).forEach((item) => {
    const qty = Number(item.quantity || 1);
    const name = clean(item.name || item.title || "Produit");
    lines.push(ESC + "E" + "\x01", `${qty} x ${name}\n`, ESC + "E" + "\x00");
    itemDetails(item).forEach((detail) => lines.push(`  - ${clean(detail)}\n`));
  });

  if (order.notes || order.note) {
    lines.push(separator, `NOTE: ${clean(order.notes || order.note)}\n`);
  }

  lines.push(separator, ESC + "a" + "\x01", "BONNE PREPARATION\n", "\n\n\n");
  lines.push(GS + "V" + "\x41" + "\x00");
  return lines;
}

async function printKitchenOrder(orderId) {
  if (!orderId || inFlight.has(orderId)) return;
  const printedKey = `${PRINTED_PREFIX}${orderId}`;
  if (localStorage.getItem(printedKey)) return;

  inFlight.add(orderId);
  try {
    const order = await getOrder(orderId);
    if (!order) return;

    const acceptedTime = acceptedAt(order);
    if (!Number.isFinite(acceptedTime) || Date.now() - acceptedTime > MAX_ACCEPT_AGE_MS) {
      localStorage.setItem(printedKey, "old");
      return;
    }

    const qz = await getQz();
    const printer = await findKitchenPrinter(qz);
    if (!printer) {
      console.warn("Imprimante cuisine 'chaud' introuvable.");
      return;
    }

    const config = qz.configs.create(printer, { encoding: "CP858" });
    await qz.print(config, buildKitchenTicket(order));
    localStorage.setItem(printedKey, new Date().toISOString());
    console.info(`Ticket cuisine #${orderId} imprime sur ${printer}.`);
  } catch (error) {
    console.error(`Impression cuisine impossible pour #${orderId}:`, error);
  } finally {
    inFlight.delete(orderId);
  }
}

function scanAcceptedOrders() {
  if (!kitchenModeEnabled()) return;

  document.querySelectorAll(".workflow-snack .workflow-card").forEach((card) => {
    const status = card.querySelector(".workflow-card-top .workflow-status")?.textContent?.trim() || "";
    if (!["ACCEPTÉE PAR LE CAISSIER", "VALIDÉE PAR LE SNACK"].includes(status)) return;

    const rawId = card.querySelector(".workflow-card-top b")?.textContent || "";
    const orderId = rawId.replace(/^#/, "").trim();
    if (orderId) void printKitchenOrder(orderId);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("load", scanAcceptedOrders);
  window.addEventListener("popstate", () => setTimeout(scanAcceptedOrders, 100));
  setInterval(scanAcceptedOrders, 2500);
  setTimeout(scanAcceptedOrders, 800);
}

import { getOrder } from "./ordersApi";

const QZ_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.js";
const PRINTER_NAME = "imp caisse";
const TICKET_WIDTH = 32;

let qzScriptPromise;
let connectPromise;

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

  if (qz.websocket.isActive()) return qz;
  if (!connectPromise) {
    connectPromise = qz.websocket
      .connect({ retries: 3, delay: 1 })
      .finally(() => {
        connectPromise = null;
      });
  }

  await connectPromise;
  return qz;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  const number = numberOrZero(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
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

function wrapText(value, width = TICKET_WIDTH) {
  const text = clean(value);
  if (!text) return [];

  const rows = [];
  let row = "";

  for (const rawWord of text.split(" ")) {
    let word = rawWord;

    while (word.length > width) {
      if (row) {
        rows.push(row);
        row = "";
      }
      rows.push(word.slice(0, width));
      word = word.slice(width);
    }

    const next = row ? `${row} ${word}` : word;
    if (next.length <= width) {
      row = next;
    } else {
      if (row) rows.push(row);
      row = word;
    }
  }

  if (row) rows.push(row);
  return rows;
}

function twoColumns(leftValue, rightValue, width = TICKET_WIDTH) {
  const left = clean(leftValue);
  const right = clean(rightValue);
  const spaces = Math.max(1, width - left.length - right.length);
  const line = `${left}${" ".repeat(spaces)}${right}`;
  return line.length <= width ? line : `${left}\n${right.padStart(width, " ")}`;
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

function itemPricing(item) {
  const qty = Math.max(1, numberOrZero(item.quantity || 1));
  let unitPrice = numberOrZero(
    item.finalPrice ?? item.unitPrice ?? item.price ?? item.selectedPrice ?? item.basePrice,
  );
  let lineTotal = numberOrZero(item.lineTotal ?? item.totalPrice ?? item.itemTotal);

  if (!lineTotal && unitPrice) lineTotal = unitPrice * qty;
  if (!unitPrice && lineTotal) unitPrice = lineTotal / qty;

  return { qty, unitPrice, lineTotal };
}

function buildTicket(order) {
  const ESC = "\x1B";
  const GS = "\x1D";
  const lines = [];
  const isPickup = order.orderType === "pickup";
  const separator = `${"-".repeat(TICKET_WIDTH)}\n`;
  const dotted = `${".".repeat(TICKET_WIDTH)}\n`;
  const orderId = clean(order.id);
  const createdAt = new Date(order.createdAt || Date.now());

  lines.push(ESC + "@", ESC + "a" + "\x01", ESC + "E" + "\x01");
  lines.push("HANAA FOOD\n");
  lines.push(ESC + "E" + "\x00");
  if (order.branchName) lines.push(`${clean(order.branchName)}\n`);
  lines.push(`${isPickup ? "A EMPORTER" : "LIVRAISON"}\n`);
  lines.push(separator);

  lines.push(ESC + "E" + "\x01", "COMMANDE\n");
  if (orderId.length <= 12) {
    lines.push(ESC + "!" + "\x30", `#${orderId}\n`, ESC + "!" + "\x00");
  } else {
    wrapText(`#${orderId}`, TICKET_WIDTH).forEach((row) => lines.push(`${row}\n`));
  }
  lines.push(ESC + "E" + "\x00");
  lines.push(`${createdAt.toLocaleString("fr-FR")}\n`);
  lines.push(separator);

  lines.push(ESC + "a" + "\x00");
  if (order.customerName) lines.push(`CLIENT: ${clean(order.customerName)}\n`);
  if (order.customerPhone) lines.push(`TEL: ${clean(order.customerPhone)}\n`);
  if (!isPickup && order.deliveryAddress) {
    wrapText(`ADRESSE: ${order.deliveryAddress}`).forEach((row) => lines.push(`${row}\n`));
  }
  if (!isPickup && order.distanceKm != null) {
    lines.push(`DISTANCE: ${money(order.distanceKm)} KM\n`);
  }
  lines.push(separator);

  lines.push(ESC + "E" + "\x01", "ARTICLES\n", ESC + "E" + "\x00");

  const items = order.items || [];
  items.forEach((item, index) => {
    const { qty, unitPrice, lineTotal } = itemPricing(item);
    const name = clean(item.name || item.title || "Article") || "Article";
    const productPrefix = `${qty} x `;
    const nameWidth = Math.max(8, TICKET_WIDTH - productPrefix.length);
    const nameRows = wrapText(name, nameWidth);
    const firstName = nameRows.shift() || "Article";

    lines.push(ESC + "E" + "\x01");
    lines.push(`${productPrefix}${firstName}\n`);
    lines.push(ESC + "E" + "\x00");
    nameRows.forEach((part) => lines.push(`${" ".repeat(productPrefix.length)}${part}\n`));

    lines.push(`${twoColumns(`PU: ${money(unitPrice)} DH`, `TOTAL: ${money(lineTotal)} DH`)}\n`);

    itemDetails(item).forEach((detail) => {
      wrapText(`- ${detail}`, TICKET_WIDTH).forEach((row) => lines.push(`${row}\n`));
    });

    if (index < items.length - 1) lines.push(dotted);
  });

  lines.push(separator);

  const computedSubtotal = items.reduce((sum, item) => sum + itemPricing(item).lineTotal, 0);
  const subtotal = order.subtotal != null ? numberOrZero(order.subtotal) : computedSubtotal;

  lines.push(`${twoColumns("SOUS-TOTAL", `${money(subtotal)} DH`)}\n`);
  if (!isPickup) {
    lines.push(`${twoColumns("LIVRAISON", `${money(order.deliveryFee)} DH`)}\n`);
  }

  lines.push(ESC + "E" + "\x01");
  lines.push(`${twoColumns("TOTAL", `${money(order.total)} DH`)}\n`);
  lines.push(ESC + "E" + "\x00");
  lines.push(`PAIEMENT: ${clean(order.paymentMethod || "A la livraison")}\n`);

  if (order.notes || order.note) {
    lines.push(separator);
    wrapText(`NOTE: ${order.notes || order.note}`).forEach((row) => lines.push(`${row}\n`));
  }

  lines.push(separator);
  lines.push(ESC + "a" + "\x01", ESC + "E" + "\x01");
  lines.push("MERCI POUR VOTRE COMMANDE\n");
  lines.push(ESC + "E" + "\x00", "BON APPETIT !\n", "\n\n\n");
  lines.push(GS + "V" + "\x41" + "\x00");

  return lines;
}

export async function printCashierOrder(order) {
  const qz = await getQz();
  const printers = await qz.printers.find();
  if (!Array.isArray(printers) || !printers.length) {
    throw new Error("Aucune imprimante detectee.");
  }

  const preferred = printers.find((name) =>
    String(name).toLowerCase().includes(PRINTER_NAME.toLowerCase()),
  );
  const printer = preferred || (printers.length === 1 ? printers[0] : null);

  if (!printer) {
    throw new Error(`Imprimante '${PRINTER_NAME}' introuvable.`);
  }

  const config = qz.configs.create(printer, { encoding: "CP858" });
  await qz.print(config, buildTicket(order));
  return printer;
}

function readOrderId(card) {
  const text = card.querySelector(".workflow-card-top b")?.textContent || "";
  return text.replace(/^#/, "").trim();
}

function isNewOrder(card) {
  const status = card.querySelector(".workflow-card-top .workflow-status")?.textContent?.trim() || "";
  return status === "NOUVELLE" || status === "NOUVELLE COMMANDE";
}

function addPrintButton(card) {
  if (!card || card.querySelector(".workflow-print-ticket")) return;
  if (isNewOrder(card)) return;

  const actions = card.querySelector(".workflow-actions");
  if (!actions) return;

  const orderId = readOrderId(card);
  if (!orderId) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "workflow-print-ticket";
  const printKey = `hanaa-qz-manual-printed:${orderId}`;
  button.textContent = sessionStorage.getItem(printKey)
    ? "REIMPRIMER TICKET"
    : "IMPRIMER TICKET";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "IMPRESSION...";

    try {
      const order = await getOrder(orderId);
      if (!order) throw new Error("Commande introuvable.");
      const printer = await printCashierOrder(order);
      sessionStorage.setItem(printKey, "1");
      button.textContent = "REIMPRIMER TICKET";
      window.setTimeout(() => {
        button.disabled = false;
      }, 500);
      console.info(`Ticket #${orderId} imprime sur ${printer}.`);
    } catch (error) {
      console.error(`Impression QZ impossible pour #${orderId}:`, error);
      button.textContent = originalText;
      button.disabled = false;
      window.alert(
        `Ticket ma khrejch. Khalli QZ Tray ma7loul w verifie imprimante '${PRINTER_NAME}'.\n${error?.message || error}`,
      );
    }
  });

  actions.appendChild(button);
}

function installManualPrintButtons() {
  if (!document.getElementById("hanaa-print-button-style")) {
    const style = document.createElement("style");
    style.id = "hanaa-print-button-style";
    style.textContent = `
      .workflow-snack .workflow-print-ticket {
        min-height: 50px;
        padding: 0 18px !important;
        border: 0 !important;
        border-radius: 12px !important;
        background: #111827 !important;
        color: #ffffff !important;
        font-size: 13px !important;
        font-weight: 900 !important;
        letter-spacing: .02em;
        cursor: pointer;
        flex: 0 1 180px;
      }
      .workflow-snack .workflow-print-ticket:disabled {
        opacity: .55;
        cursor: wait;
      }
    `;
    document.head.appendChild(style);
  }

  const syncButtons = () => {
    if (window.location.pathname !== "/snack") return;
    document.querySelectorAll(".workflow-snack .workflow-card").forEach(addPrintButton);
  };

  const observer = new MutationObserver(syncButtons);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", syncButtons);
  window.addEventListener("popstate", () => setTimeout(syncButtons, 50));
  setInterval(syncButtons, 1500);
  syncButtons();
}

if (typeof window !== "undefined") {
  installManualPrintButtons();
}

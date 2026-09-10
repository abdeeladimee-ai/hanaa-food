const QZ_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.js";
const PRINTER_NAME = "imp caisse";

let qzScriptPromise;
let connectPromise;

function loadQz() {
  if (window.qz) return Promise.resolve(window.qz);
  if (qzScriptPromise) return qzScriptPromise;

  qzScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QZ_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.qz), { once: true });
      existing.addEventListener("error", () => reject(new Error("Impossible de charger QZ Tray.")), { once: true });
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

function money(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTicket(order) {
  const ESC = "\x1B";
  const GS = "\x1D";
  const lines = [];
  const isPickup = order.orderType === "pickup";

  lines.push(ESC + "@", ESC + "a" + "\x01", ESC + "E" + "\x01");
  lines.push("HANAA FOOD\n");
  lines.push(ESC + "E" + "\x00");
  lines.push(`${isPickup ? "A EMPORTER" : "LIVRAISON"}\n`);
  lines.push(`COMMANDE #${clean(order.id)}\n`);
  lines.push(`${new Date().toLocaleString("fr-FR")}\n`);
  lines.push("------------------------------------------\n");
  lines.push(ESC + "a" + "\x00");

  if (order.customerName) lines.push(`Client: ${clean(order.customerName)}\n`);
  if (order.customerPhone) lines.push(`Tel: ${clean(order.customerPhone)}\n`);
  if (!isPickup && order.deliveryAddress) lines.push(`Adresse: ${clean(order.deliveryAddress)}\n`);
  if (order.branchName) lines.push(`Snack: ${clean(order.branchName)}\n`);

  lines.push("------------------------------------------\n");
  (order.items || []).forEach((item) => {
    const qty = Number(item.quantity || 1);
    const name = clean(item.name || "Article");
    const price = Number(item.price || 0) * qty;
    lines.push(`${qty} x ${name}\n`);
    if (price) lines.push(`    ${money(price)} DH\n`);
  });

  lines.push("------------------------------------------\n");
  if (!isPickup) lines.push(`Livraison: ${money(order.deliveryFee)} DH\n`);
  lines.push(ESC + "E" + "\x01");
  lines.push(`TOTAL: ${money(order.total)} DH\n`);
  lines.push(ESC + "E" + "\x00");
  lines.push(`Paiement: ${clean(order.paymentMethod || "A la livraison")}\n`);
  lines.push("\n\n");
  lines.push(ESC + "a" + "\x01", "MERCI\n", "\n\n\n");
  lines.push(GS + "V" + "\x00");

  return lines;
}

export async function printCashierOrder(order) {
  const qz = await getQz();
  const printer = await qz.printers.find(PRINTER_NAME);
  const config = qz.configs.create(printer, { encoding: "CP850" });
  await qz.print(config, buildTicket(order));
}

function findAcceptedOrder(orderId) {
  try {
    const orders = JSON.parse(localStorage.getItem("hanaa-orders") || "[]");
    return orders.find((order) => String(order.id) === String(orderId));
  } catch {
    return null;
  }
}

function readOrderId(card) {
  const text = card.querySelector(".workflow-card-top b")?.textContent || "";
  return text.replace(/^#/, "").trim();
}

function waitForAcceptedOrder(orderId, attempts = 15) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const order = findAcceptedOrder(orderId);
      const accepted = order && ["ACCEPTÉE PAR LE CAISSIER", "VALIDÉE PAR LE SNACK"].includes(order.statusLabel);

      if (accepted) {
        resolve(order);
        return;
      }

      if (attempts <= 0) {
        reject(new Error("Commande acceptee introuvable."));
        return;
      }

      attempts -= 1;
      setTimeout(check, 120);
    };

    setTimeout(check, 80);
  });
}

function installAutoPrint() {
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("button.workflow-accept");
      if (!button || button.textContent.trim() !== "ACCEPTER") return;

      const card = button.closest(".workflow-card");
      if (!card) return;

      const orderId = readOrderId(card);
      if (!orderId) return;

      const printKey = `hanaa-qz-printed:${orderId}`;
      if (sessionStorage.getItem(printKey)) return;

      waitForAcceptedOrder(orderId)
        .then((order) => printCashierOrder(order).then(() => order))
        .then(() => {
          sessionStorage.setItem(printKey, "1");
          console.info(`Ticket #${orderId} imprime sur ${PRINTER_NAME}.`);
        })
        .catch((error) => {
          console.error(`Impression QZ impossible pour #${orderId}:`, error);
          window.alert(
            "Commande acceptee, mais le ticket n'a pas pu etre imprime. Verifiez que QZ Tray est ouvert puis reessayez.",
          );
        });
    },
    true,
  );
}

if (typeof window !== "undefined") {
  installAutoPrint();
}

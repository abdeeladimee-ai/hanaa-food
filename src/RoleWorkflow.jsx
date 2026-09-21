import { useEffect, useMemo, useRef, useState } from "react";
import AdminNavigation from "./components/AdminNavigation";
import { signOut } from "./auth";
import { configureQzSecurity } from "./qzSecurity";

import { getOrder, listOrders, subscribeOrders, updateExistingOrder, upsertOrder } from "./ordersApi";
const branches = [
  { id: "tadart", name: "Hanaa Food Tadart" },
  { id: "amgala", name: "Hanaa Food Amgala" },
  { id: "rue-baghdad", name: "Hanaa Food Rue Baghdad" },
];
const statuses = [
  "NOUVELLE",
  "ACCEPTÉE PAR LE CAISSIER",
  "EN PRÉPARATION",
  "PRÊTE",
  "PRISE PAR LE LIVREUR",
  "EN LIVRAISON",
  "LIVRÉE",
  "REFUSÉE",
];
const pickupStatuses = [
  "NOUVELLE COMMANDE",
  "VALIDÉE PAR LE SNACK",
  "EN PRÉPARATION",
  "PRÊTE",
  "RÉCUPÉRÉE",
  "REFUSÉE PAR LE SNACK",
];
const now = () => new Date().toISOString();
const DRIVER_LIVE_START_AT = Date.parse("2026-09-19T11:39:42Z");

const isDriverLiveOrder = (order) => {
  const createdAt = Date.parse(order?.createdAt || "");
  return Number.isFinite(createdAt) && createdAt >= DRIVER_LIVE_START_AT;
};
const labelClass = (status) => status.toLowerCase().replaceAll(" ", "-");
const notificationAudios = {};

const getNotificationAudio = (role) => {
  const soundPath =
    role === "driver"
      ? "/sounds/notificacion-glovo-app.mp3"
      : "/sounds/glovo-tab-notification.mp3";

  if (!notificationAudios[soundPath]) {
    const audio = new Audio(soundPath);
    audio.preload = "auto";
    audio.volume = 1;
    notificationAudios[soundPath] = audio;
  }

  return notificationAudios[soundPath];
};

const playNotificationTone = async (role) => {
  try {
    const audio = getNotificationAudio(role);
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch (error) {
    console.error("Notification sound blocked or missing:", error);
    return false;
  }
};


// HANAA_QZ_INTEGRATION_START
const QZ_SCRIPT_URL = "/qz-tray.js";
const QZ_PRINTER_STORAGE_KEY = "hanaa-qz-printer";
let qzScriptPromise = null;
const QZ_GLOBAL_CONNECT_KEY = "__hanaaQzConnectPromise";

const qzAscii = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");

const qzMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(number % 1 ? 2 : 0) : "0";
};

const qzDetailText = (value) => {
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
      .map(([key, item]) => {
        if (Array.isArray(item)) return `${key}: ${qzDetailText(item)}`;
        if (typeof item === "object") return "";
        return `${key}: ${item}`;
      })
      .filter(Boolean)
      .join(" | ");
  }
  return String(value);
};


const QZ_BRANCH_NAMES = {
  tadart: "HANAA FOOD TADART",
  amgala: "HANAA FOOD AMGALA",
  "rue-baghdad": "HANAA FOOD BAGHDAD",
};

const qzBranchName = (order) => {
  const id = String(order?.branchId || "").trim().toLowerCase();
  return qzAscii(order?.branchName || QZ_BRANCH_NAMES[id] || "HANAA FOOD").toUpperCase();
};

const qzTicketTime = (order) => {
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
        timeZone: "UTC",
      });
};

const qzPairLine = (left, right, width = 42) => {
  const a = qzAscii(left);
  const b = qzAscii(right);
  const room = Math.max(1, width - b.length);
  const trimmed = a.slice(0, room - 1);
  return trimmed + " ".repeat(Math.max(1, width - trimmed.length - b.length)) + b + "\n";
};

const qzItemDetails = (item) => {
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
      const text = qzDetailText(value);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);
};

const qzLoad = () => {
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
};

const qzEnsureConnected = async () => {
  const qz = await qzLoad();
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
};

const qzResolvePrinter = async (qz) => {
  const printers = await qz.printers.find();
  if (!Array.isArray(printers) || printers.length === 0) {
    throw new Error("Windows ma l9a ta imprimante.");
  }

  const saved = localStorage.getItem(QZ_PRINTER_STORAGE_KEY);
  if (saved && printers.includes(saved)) return saved;

  const preferredWords = [
    "imp caisse",
    "wd8260",
    "wdlink",
    "caisse",
    "pos-80",
    "pos80",
    "ticket",
    "thermal",
    "receipt",
  ];

  const lower = printers.map((name) => ({ name, value: String(name).toLowerCase() }));
  const match =
    preferredWords
      .map((word) => lower.find((printer) => printer.value.includes(word)))
      .find(Boolean)?.name ||
    (printers.length === 1 ? printers[0] : null);

  if (!match) {
    throw new Error(
      `Imprimante caisse ma t3rftch automatiquement. Printers: ${printers.join(", ")}`
    );
  }

  localStorage.setItem(QZ_PRINTER_STORAGE_KEY, match);
  return match;
};

const qzBuildTicket = (order) => {
  const ESC = "\x1b";
  const GS = "\x1d";
  const lines = [];
  const separator = "------------------------------------------\n";
  const isPickup = order.orderType === "pickup";
  const typeLabel = isPickup ? "A EMPORTER" : "LIVRAISON";

  lines.push(ESC + "@");
  lines.push(ESC + "a" + "\x01");
  lines.push(ESC + "E" + "\x01", "HANAA FOOD\n", ESC + "E" + "\x00");
  lines.push(qzBranchName(order) + "\n");
  lines.push(separator);

  lines.push(ESC + "!" + "\x30");
  lines.push("#" + qzAscii(order.id || "-") + "\n");
  lines.push(typeLabel + "\n");
  lines.push(ESC + "!" + "\x00");
  lines.push(qzTicketTime(order) + "\n");
  lines.push(separator);

  lines.push(ESC + "a" + "\x00");

  if (order.customerName) {
    lines.push(ESC + "E" + "\x01", ESC + "!" + "\x10");
    lines.push("CLIENT: " + qzAscii(order.customerName) + "\n");
    lines.push(ESC + "!" + "\x00", ESC + "E" + "\x00");
  }

  if (order.customerPhone) {
    lines.push(ESC + "!" + "\x10");
    lines.push("TEL: " + qzAscii(order.customerPhone) + "\n");
    lines.push(ESC + "!" + "\x00");
  }

  if (!isPickup && order.driverName) {
    lines.push(ESC + "E" + "\x01", ESC + "!" + "\x10");
    lines.push("LIVREUR: " + qzAscii(order.driverName).toUpperCase() + "\n");
    lines.push(ESC + "!" + "\x00", ESC + "E" + "\x00");
  }

  if (!isPickup && order.deliveryAddress) {
    lines.push("ADRESSE: " + qzAscii(order.deliveryAddress) + "\n");
  }

  if (!isPickup && order.distanceKm != null) {
    lines.push("DISTANCE: " + qzMoney(order.distanceKm) + " KM\n");
  }

  lines.push(separator);
  lines.push(ESC + "a" + "\x01", ESC + "E" + "\x01", "DETAIL COMMANDE\n", ESC + "E" + "\x00", ESC + "a" + "\x00");

  const items = Array.isArray(order.items) ? order.items : [];

  if (!items.length) {
    lines.push("Commande\n");
  } else {
    items.forEach((item, index) => {
      const qty = Number(item.quantity || 1);
      const name = qzAscii(item.name || item.title || "Produit");
      const unit = Number(item.price || 0);
      const lineTotal = unit * qty;

      lines.push(ESC + "E" + "\x01", ESC + "!" + "\x10");
      lines.push(qty + " X " + name + "\n");
      lines.push(ESC + "!" + "\x00", ESC + "E" + "\x00");

      if (unit) lines.push("    " + qzMoney(lineTotal) + " DH\n");

      qzItemDetails(item).forEach((detail) => {
        lines.push("  > " + qzAscii(detail) + "\n");
      });

      if (index < items.length - 1) lines.push("\n");
    });
  }

  lines.push(separator);

  if (order.subtotal != null) {
    lines.push(qzPairLine("SOUS-TOTAL", qzMoney(order.subtotal) + " DH"));
  }

  if (!isPickup) {
    lines.push(qzPairLine("LIVRAISON", qzMoney(order.deliveryFee || 0) + " DH"));
  }

  lines.push(separator);
  lines.push(ESC + "a" + "\x01", ESC + "E" + "\x01", ESC + "!" + "\x30");
  lines.push("TOTAL\n");
  lines.push(qzMoney(order.total) + " DH\n");
  lines.push(ESC + "!" + "\x00", ESC + "E" + "\x00");

  lines.push(ESC + "!" + "\x10");
  lines.push("PAIEMENT: " + qzAscii(order.paymentMethod || "A LA LIVRAISON") + "\n");
  lines.push(ESC + "!" + "\x00");

  if (order.notes || order.note) {
    lines.push(separator);
    lines.push(ESC + "a" + "\x00", ESC + "E" + "\x01");
    lines.push("NOTE: " + qzAscii(order.notes || order.note) + "\n");
    lines.push(ESC + "E" + "\x00");
  }

  lines.push(separator);
  lines.push(ESC + "a" + "\x01");
  lines.push("MERCI POUR VOTRE COMMANDE\n");
  lines.push("BON APPETIT\n\n\n");
  lines.push(GS + "V" + "\x41" + "\x00");

  return lines;
};

const printOrderTicketQz = async (order) => {
  const qz = await qzEnsureConnected();
  const printer = await qzResolvePrinter(qz);
  const config = qz.configs.create(printer, { encoding: "CP858" });
  await qz.print(config, qzBuildTicket(order));
  return printer;
};

const printDriverAssignmentSlip = async (order) => {
  const qz = await qzEnsureConnected();
  const printer = await qzResolvePrinter(qz);
  const config = qz.configs.create(printer, { encoding: "CP858" });
  const ESC = "\x1b";
  const GS = "\x1d";
  const driver = qzAscii(order?.driverName || "Livreur").toUpperCase();
  const orderId = qzAscii(order?.id || "-");

  const data = [
    ESC + "@",
    ESC + "a" + "\x01",
    ESC + "E" + "\x01",
    "HANAA FOOD\n",
    qzBranchName(order) + "\n",
    ESC + "E" + "\x00",
    "------------------------------------------\n",
    ESC + "!" + "\x30",
    "#" + orderId + "\n",
    ESC + "!" + "\x00",
    "LIVREUR\n",
    ESC + "E" + "\x01",
    ESC + "!" + "\x30",
    driver + "\n",
    ESC + "!" + "\x00",
    ESC + "E" + "\x00",
    "------------------------------------------\n",
    "REMETTRE CETTE COMMANDE A CE LIVREUR\n",
    "\n\n",
    GS + "V" + "\x41" + "\x00",
  ];

  await qz.print(config, data);
  return printer;
};
// HANAA_QZ_INTEGRATION_END

export default function RoleWorkflow({ role, session, onHome, orderType, title, staffBranchId }) {
  const [orders, setOrders] = useState([]);
  const branchId = session?.branchId || staffBranchId || null;
  const [snackOrderType, setSnackOrderType] = useState("delivery");
  const activeOrderType = role === "snack" ? snackOrderType : orderType;
  const [reasonOrder, setReasonOrder] = useState(null);
  const [reason, setReason] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [notification, setNotification] = useState("");
  const audioEnabledRef = useRef(false);
  const knownOrderKeys = useRef(new Set());
  const knownDriverAssignments = useRef(new Set());
  const hasSyncedOrders = useRef(false);
  const lastOrdersSnapshot = useRef("");
  const driverId = session?.id || null;
  const driverName = session?.name || "Livreur";

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    let active = true;

    const isRelevantForNotification = (order) => {
      if (role === "snack") {
        return (
          order.branchId === branchId &&
          (
            (order.orderType === "delivery" && order.statusLabel === "NOUVELLE") ||
            (order.orderType === "pickup" && order.statusLabel === "NOUVELLE COMMANDE")
          )
        );
      }

      return (
        role === "driver" &&
        isDriverLiveOrder(order) &&
        order.orderType === "delivery" &&
        order.statusLabel === "ACCEPTÉE PAR LE CAISSIER" &&
        !order.driverId
      );
    };

    const notificationKey = (order) =>
      `${order.id}:${order.orderType}:${order.statusLabel}`;

    const applyOrders = (nextOrders) => {
      if (!active) return;

      const snapshot = JSON.stringify(nextOrders);
      if (snapshot === lastOrdersSnapshot.current && hasSyncedOrders.current) return;

      const unseenRelevantOrders = nextOrders.filter(
        (order) =>
          isRelevantForNotification(order) &&
          !knownOrderKeys.current.has(notificationKey(order)),
      );

      const assignmentKey = (order) =>
        `${order.id}:${order.driverId || ""}`;

      const assignedForThisSnack = nextOrders.filter(
        (order) =>
          role === "snack" &&
          order.orderType === "delivery" &&
          order.branchId === branchId &&
          order.driverId &&
          order.driverName,
      );

      if (!hasSyncedOrders.current) {
        nextOrders.forEach((order) =>
          knownOrderKeys.current.add(notificationKey(order)),
        );
        assignedForThisSnack.forEach((order) =>
          knownDriverAssignments.current.add(assignmentKey(order)),
        );
      } else {
        assignedForThisSnack.forEach((order) => {
          const key = assignmentKey(order);
          if (knownDriverAssignments.current.has(key)) return;

          knownDriverAssignments.current.add(key);

          void printDriverAssignmentSlip(order)
            .then(() => {
              if (active) {
                setNotification(
                  `LIVREUR ${order.driverName} — COMMANDE #${order.id}`,
                );
              }
            })
            .catch((error) => {
              console.error("Driver assignment slip print failed:", error);
              if (active) {
                setNotification(
                  `LIVREUR ${order.driverName} — #${order.id} — TICKET A VERIFIER`,
                );
              }
            });
        });
      }

      if (hasSyncedOrders.current && unseenRelevantOrders.length) {
        const newestOrder = unseenRelevantOrders[0];

        if (role === "snack") {
          setNotification(
            newestOrder.orderType === "pickup"
              ? "NOUVELLE COMMANDE À EMPORTER"
              : "NOUVELLE COMMANDE LIVRAISON",
          );
        } else if (role === "driver") {
          setNotification("NOUVELLE LIVRAISON DISPONIBLE");
        }

        unseenRelevantOrders.forEach((order) =>
          knownOrderKeys.current.add(notificationKey(order)),
        );

        if (audioEnabledRef.current) void playNotificationTone(role);
      }

      lastOrdersSnapshot.current = snapshot;
      hasSyncedOrders.current = true;
      setOrders(nextOrders);
    };

    const load = async () => {
      try {
        applyOrders(
          await listOrders(
            role === "snack" && branchId ? { branchId } : undefined,
          ),
        );
      } catch (error) {
        console.error("Supabase orders sync failed:", error);
      }
    };

    void load();

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeOrders(() => {
        void load();
      });
    } catch (error) {
      console.error("Supabase realtime start failed:", error);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [branchId, role]);

  const updateOrder = async (orderId, updater) => {
    try {
      const current = await getOrder(orderId);
      if (!current) return null;

      const updated = updater(current);
      const saved = await upsertOrder(updated);

      setOrders((currentOrders) =>
        currentOrders.map((item) => (item.id === saved.id ? saved : item)),
      );

      return saved;
    } catch (error) {
      console.error("Supabase order update failed:", error);
      window.alert("Mise à jour commande ma dazatch. Chouf connexion.");
      return null;
    }
  };

  const transition = (order, status, extra = {}) =>
    updateOrder(order.id, (current) => ({
      ...current,
      ...extra,
      statusLabel: status,
      statusHistory: [
        ...(current.statusHistory || []),
        { status, at: now(), ...extra },
      ],
    }));

  const settleDriver = async (order) => {
    if (!order?.driverId || !order?.driverName) {
      window.alert("Had commande ma fihach livreur enregistré.");
      return;
    }

    const amount =
      order.paymentMethod === "Carte" ? 0 : Number(order.total || 0);

    const ok = window.confirm(
      `Encaisser ${order.driverName} pour la commande #${order.id} ?\nMontant à remettre à la caisse: ${amount} DH`,
    );

    if (!ok) return;

    const saved = await updateOrder(order.id, (current) => ({
      ...current,
      driverSettled: true,
      driverSettledAt: now(),
      driverSettledBy: session?.name || session?.id || "Caissier",
      driverSettledAmount: amount,
    }));

    if (saved) {
      setNotification(
        `ENCAISSÉ — ${order.driverName} — #${order.id} — ${amount} DH`,
      );
    }
  };

  const visibleOrders = useMemo(() => {
    const typed = activeOrderType
      ? orders.filter((order) => order.orderType === activeOrderType)
      : orders;
    if (role === "admin") return typed;
    if (role === "snack")
      return typed.filter((order) => order.branchId === branchId);
    return typed.filter(
      (order) =>
        isDriverLiveOrder(order) &&
        (
          (order.statusLabel === "ACCEPTÉE PAR LE CAISSIER" && !order.driverId) ||
          order.driverId === driverId
        ),
    );
  }, [activeOrderType, branchId, driverId, orders, role]);
  const accept = async (order) => {
    const acceptedStatus =
      order.orderType === "pickup"
        ? "VALIDÉE PAR LE SNACK"
        : "ACCEPTÉE PAR LE CAISSIER";

    const acceptedExtra =
      order.orderType === "pickup"
        ? {
            cashierAcceptedBy: session?.id || `staff-${branchId}`,
            cashierAcceptedAt: now(),
            branchId,
          }
        : {
            cashierAcceptedBy: session?.id || `staff-${branchId}`,
            cashierAcceptedAt: now(),
            branchId,
            driverQueueAt: now(),
          };

    const nextOrder = {
      ...order,
      ...acceptedExtra,
      statusLabel: acceptedStatus,
      statusHistory: [
        ...(order.statusHistory || []),
        { status: acceptedStatus, at: now(), ...acceptedExtra },
      ],
    };

    let acceptedOrder = null;

    try {
      acceptedOrder = await updateExistingOrder(nextOrder);
      setOrders((currentOrders) =>
        currentOrders.map((item) =>
          item.id === acceptedOrder.id ? acceptedOrder : item,
        ),
      );
      setNotification(`COMMANDE #${acceptedOrder.id} ACCEPTEE`);
    } catch (error) {
      console.error("Supabase order accept failed:", error);
      window.alert("Validation ma dazatch. 3awed jarrab f chwya.");
      return;
    }

    try {
      if (role === "snack") {
        const printKitchen = window.__hanaaPrintKitchenOrder;
        if (typeof printKitchen !== "function") {
          throw new Error("Module impression cuisine mazal ma tchargach.");
        }

        const kitchenPrinters = await printKitchen(acceptedOrder.id);
        if (!Array.isArray(kitchenPrinters) || kitchenPrinters.length === 0) {
          throw new Error("Ticket cuisine ma khrejch.");
        }

        setNotification(
          `CUISINE IMPRIMÉE — ${kitchenPrinters.join(" + ")}`
        );
      }

      const printer = await printOrderTicketQz(acceptedOrder);
      setNotification(`CUISINE + CAISSE IMPRIMÉES — ${printer}`);
    } catch (error) {
      console.error("QZ print error:", error);
      setNotification("COMMANDE ACCEPTÉE — TICKET CUISINE À VÉRIFIER");
      window.alert(
        `Commande acceptée, mais ticket cuisine ma khrejch.\n${error?.message || error}\n\nVerifie QZ Tray w imprimante cuisine.`
      );
    }
  };
  const refuse = () => {
    if (!reason.trim()) return;
    transition(
      reasonOrder,
      reasonOrder.orderType === "pickup" ? "REFUSÉE PAR LE SNACK" : "REFUSÉE",
      {
        refusedBy: session?.id || `staff-${branchId}`,
        refusedAt: now(),
        refusalReason: reason.trim(),
      },
    );
    setReasonOrder(null);
    setReason("");
  };
  const take = async (order) => {
    if (!driverId) return;

    try {
      const candidate = await getOrder(order.id);
      if (
        !candidate ||
        candidate.statusLabel !== "ACCEPTÉE PAR LE CAISSIER" ||
        candidate.driverId
      ) {
        return;
      }

      await updateOrder(order.id, (current) => ({
        ...current,
        driverId,
        driverName,
        driverTakenAt: now(),
        statusLabel: "PRISE PAR LE LIVREUR",
        statusHistory: [
          ...(current.statusHistory || []),
          {
            status: "PRISE PAR LE LIVREUR",
            at: now(),
            driverId,
            driverName,
          },
        ],
      }));
    } catch (error) {
      console.error("Driver claim failed:", error);
    }
  };

  return (
    <main className={`workflow-page workflow-${role}`}>
      {role === "snack" && (
        <style>{`
          .workflow-snack {
            padding: 22px 18px 50px !important;
          }
          .workflow-snack .workflow-header,
          .workflow-snack .admin-navigation,
          .workflow-snack .workflow-filter-note,
          .workflow-snack > .workflow-actions,
          .workflow-snack .workflow-orders,
          .workflow-snack .workflow-sound,
          .workflow-snack .workflow-notification {
            width: min(880px, 100%) !important;
            max-width: 880px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          .workflow-snack .workflow-header {
            margin-bottom: 16px !important;
            align-items: center !important;
          }
          .workflow-snack .workflow-header h1 {
            font-size: 28px !important;
          }
          .workflow-snack .admin-navigation {
            margin-bottom: 16px !important;
          }
          .workflow-snack .workflow-filter-note {
            margin-bottom: 12px !important;
          }
          .workflow-snack > .workflow-actions {
            margin-bottom: 16px !important;
            justify-content: flex-end !important;
          }
          .workflow-snack .workflow-orders {
            padding: 16px !important;
            margin-bottom: 16px !important;
            border-radius: 12px !important;
          }
          .workflow-snack .workflow-empty {
            padding: 32px 16px !important;
          }
          @media (max-width: 760px) {
            .workflow-snack {
              padding: 16px 12px 40px !important;
            }
            .workflow-snack .workflow-header {
              align-items: flex-start !important;
              flex-direction: column !important;
            }
            .workflow-snack .workflow-header-actions {
              width: 100%;
              justify-content: space-between;
            }
            .workflow-snack > .workflow-actions {
              justify-content: stretch !important;
            }
          }
        `}</style>
      )}
      {role === "admin" && (
        <style>{`
          .workflow-admin {
            background: #fff6f6 !important;
            color: #351417 !important;
          }
          .workflow-admin .workflow-header,
          .workflow-admin .workflow-section,
          .workflow-admin .workflow-card,
          .workflow-admin .workflow-filter-note {
            background: #ffffff !important;
            border-color: #f0d6d8 !important;
            color: #351417 !important;
          }
          .workflow-admin .workflow-role,
          .workflow-admin .workflow-live,
          .workflow-admin .workflow-status,
          .workflow-admin button:not(.workflow-details):not(.workflow-refuse),
          .workflow-admin select {
            background: #D71920 !important;
            color: #ffffff !important;
            border-color: #D71920 !important;
          }
          .workflow-admin .workflow-details {
            color: #D71920 !important;
            border-color: #D71920 !important;
            background: #ffffff !important;
          }
          .workflow-admin h1,
          .workflow-admin h2,
          .workflow-admin h3,
          .workflow-admin strong,
          .workflow-admin b {
            color: #351417;
          }
        `}</style>
      )}
      <header className={`workflow-header ${role === "driver" ? "driver-header" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              borderRadius: 14,
              background: "#fff",
              flexShrink: 0,
            }}
          />
          <div>
            <small
              style={{
                display: "block",
                color: "#D71920",
                fontWeight: 900,
                letterSpacing: ".1em",
                marginBottom: 4,
              }}
            >
              HANAA FOOD
            </small>
            <h1 style={{ margin: 0 }}>
              {title || (role === "snack" ? "Commandes snack" : "Livraisons")}
            </h1>
          </div>
        </div>
        <div className="workflow-header-actions">
          <span className="workflow-role">
            {role === "snack"
              ? "STAFF BRANCHE"
              : role === "admin"
                ? "ADMIN"
                : "LIVREUR"}
          </span>
          <button className="workflow-logout" onClick={() => { signOut(); window.location.href = "/login"; }}>
            Déconnexion
          </button>
        </div>
      </header>
      {(role === "driver" || role === "snack") && !audioEnabled && (
  <button
    type="button"
    className="workflow-sound"
    onClick={async () => {
      const played = await playNotificationTone(role);
      if (played) setAudioEnabled(true);
    }}
  >
    ACTIVER LE SON
  </button>
)}
      {notification && <div className="workflow-notification">{notification}<button onClick={() => setNotification("")}>×</button></div>}
      {role !== "driver" && (
        <AdminNavigation
          role={role}
          onNavigate={(path) => {
            window.location.href = path;
          }}
        />
      )}
      {role === "snack" && (
        <section className="workflow-filter-note">
          Branche active:{" "}
          <b>{branches.find((branch) => branch.id === branchId)?.name}</b>
        </section>
      )}
      {role === "snack" && (
        <div className="workflow-actions" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={
              snackOrderType === "delivery"
                ? "workflow-accept"
                : "workflow-details"
            }
            onClick={() => setSnackOrderType("delivery")}
          >
            LIVRAISON
          </button>

          <button
            type="button"
            className={
              snackOrderType === "pickup"
                ? "workflow-accept"
                : "workflow-details"
            }
            onClick={() => setSnackOrderType("pickup")}
          >
            À EMPORTER
          </button>
        </div>
      )}
      {role === "driver" ? (
        <DriverSections
          orders={visibleOrders}
          driverId={driverId}
          onTake={take}
          onTransition={transition}
          onSettleDriver={settleDriver}
          onOpen={(order) => setSelectedOrder(order)}
        />
      ) : (
        <StatusSections
          orders={visibleOrders}
          role={role}
          orderType={activeOrderType}
          onAccept={accept}
          onRefuse={(order) => setReasonOrder(order)}
          onTransition={transition}
          onOpen={(order) => setSelectedOrder(order)}
        />
      )}
      {reasonOrder && (
        <div className="pos-overlay">
          <div className="pos-modal">
            <button className="pos-close" onClick={() => setReasonOrder(null)}>
              ×
            </button>
            <h2>Motif du refus</h2>
            <label>
              Raison
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Expliquez brièvement le refus"
              />
            </label>
            <button
              className="pos-pay"
              disabled={!reason.trim()}
              onClick={refuse}
            >
              Enregistrer le refus
            </button>
          </div>
        </div>
      )}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </main>
  );
}

function StatusSections({
  orders,
  role,
  orderType,
  onAccept,
  onRefuse,
  onTransition,
  onSettleDriver,
  onOpen,
}) {
  const grouped = (orderType === "pickup" ? pickupStatuses : statuses).map(
    (status) => [
      status,
      orders.filter(
        (order) => (order.statusLabel || "NOUVELLE COMMANDE") === status,
      ),
    ],
  );
  return (
    <>
      {grouped.map(([status, group]) => (
        <section className="workflow-orders workflow-status-group" key={status}>
          <div className="workflow-section-title">
            <div>
              <span className="workflow-status">{status}</span>
              <h2>
                {group.length} commande{group.length === 1 ? "" : "s"}
              </h2>
            </div>
            <span className="workflow-live">
              {role === "admin" ? "Vue admin" : "Actualisation automatique"}
            </span>
          </div>
          {group.length ? (
            group.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                role={role}
                onAccept={onAccept}
                onRefuse={() => onRefuse(order)}
                onTransition={onTransition}
                onSettleDriver={() => onSettleDriver(order)}
                onOpen={() => onOpen(order)}
              />
            ))
          ) : (
            <div className="workflow-empty">Aucune commande.</div>
          )}
        </section>
      ))}
    </>
  );
}

function OrderCard({
  order,
  role,
  driverId,
  onAccept,
  onRefuse,
  onTake,
  onTransition,
  onSettleDriver,
  onOpen,
}) {
  const isPickup = order.orderType === "pickup";
  const isAssignedDriver = role === "driver" && order.driverId === driverId;
  const showPrivateDetails = role !== "driver" || isAssignedDriver;
  const canAccept =
    role === "snack" &&
    (
      order.statusLabel === "NOUVELLE" ||
      (isPickup && order.statusLabel === "NOUVELLE COMMANDE")
    );
  const canTake =
    role === "driver" && order.statusLabel === "ACCEPTÉE PAR LE CAISSIER" && !order.driverId;
  const canRoute =
    role === "driver" &&
    order.driverId === driverId &&
    order.statusLabel === "PRISE PAR LE LIVREUR";
  const canDeliver =
    role === "driver" &&
    order.driverId === driverId &&
    order.statusLabel === "EN LIVRAISON";
  const canReady = role === "snack" && order.statusLabel === "EN PRÉPARATION";
  const canPickup =
    role === "snack" && isPickup && order.statusLabel === "PRÊTE";
  const canStart = role === "snack" && isPickup && order.statusLabel === "VALIDÉE PAR LE SNACK";
  const isDeliveredDelivery =
    role === "snack" &&
    !isPickup &&
    order.statusLabel === "LIVRÉE";
  const canSettleDriver =
    isDeliveredDelivery &&
    order.driverId &&
    order.driverName &&
    !order.driverSettledAt;
  return (
    <article className="workflow-card">
      <div className="workflow-card-top">
        <div>
          <b>#{order.id}</b>
          <span
            className={`workflow-status ${labelClass(order.statusLabel || "NOUVELLE COMMANDE")}`}
          >
            {order.statusLabel || "NOUVELLE COMMANDE"}
          </span>
        </div>
        <time>{new Date(order.createdAt).toLocaleString("fr-FR", { timeZone: "UTC" })}</time>
      </div>
      <div className="workflow-card-grid">
        <div>
          {showPrivateDetails ? <><strong>{order.customerName || "Client"}</strong><span>{order.customerPhone || "Téléphone non renseigné"}</span><span>{isPickup ? "🥡 À emporter" : "🛵 Livraison"}</span>{!isPickup && <span>{order.deliveryAddress || "Adresse non renseignée"}</span>}</> : <><strong>Zone de livraison</strong><span>{order.deliveryAddress ? order.deliveryAddress.split(",").slice(-2).join(", ") : "Adresse à confirmer"}</span><span>🛵 Livraison</span></>}
        </div>
        <div>
          <span>
            {order.branchName ||
              order.acceptedBranchId ||
              "Branche non renseignée"}
          </span>
          {showPrivateDetails && <span>{order.items?.map((item) => `${item.quantity} × ${item.name}${item.size ? ` (${item.size})` : ""}${item.sauce ? ` · Sauce: ${item.sauce}` : ""}`).join(", ")}</span>}
          <strong>{order.total} DH</strong>
          <span>{order.paymentMethod || "Paiement à la livraison"}</span>
          {!isPickup && (
            <span>Frais de livraison: {order.deliveryFee ?? 0} DH</span>
          )}
        </div>
      </div>
      {order.driverName ? (
        <p className="workflow-assignment">
          Livreur: <b>{order.driverName}</b>
          {isDeliveredDelivery && (
            <>
              {" · "}
              {order.driverSettledAt ? (
                <b>
                  ENCAISSÉ ✓{" "}
                  {Number(order.driverSettledAmount ?? (order.paymentMethod === "Carte" ? 0 : order.total || 0))} DH
                </b>
              ) : (
                <b>
                  À ENCAISSER:{" "}
                  {order.paymentMethod === "Carte" ? 0 : Number(order.total || 0)} DH
                </b>
              )}
            </>
          )}
        </p>
      ) : (
        isDeliveredDelivery && (
          <p className="workflow-assignment">
            <b>Livreur non enregistré</b>
          </p>
        )
      )}
      {isAssignedDriver && (
        <section className="driver-payment-summary">
          <span>TOTAL COMMANDE <b>{order.total} DH</b></span>
          <span>FRAIS DE LIVRAISON <b>{order.deliveryFee ?? 0} DH</b></span>
          <strong>À ENCAISSER CHEZ LE CLIENT <b>{order.paymentMethod === "Carte" ? 0 : order.total} DH</b></strong>
        </section>
      )}
      <div className="workflow-actions">
        {canAccept && (
          <>
            <button
              type="button"
              className="workflow-accept"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onAccept(order);
              }}
            >
              ACCEPTER
            </button>
            <button
              type="button"
              className="workflow-refuse"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRefuse();
              }}
            >
              REFUSER
            </button>
          </>
        )}
        {canStart && (
          <button
            className="workflow-accept"
            onClick={() =>
              onTransition(order, "EN PRÉPARATION", {
                preparationStartedAt: now(),
              })
            }
          >
            COMMENCER PRÉPARATION
          </button>
        )}
        {canReady && (
          <button
            className="workflow-accept"
            onClick={() => onTransition(order, "PRÊTE", { readyAt: now() })}
          >
            MARQUER PRÊTE
          </button>
        )}
        {canPickup && (
          <button
            className="workflow-accept"
            onClick={() =>
              onTransition(order, "RÉCUPÉRÉE", { pickedUpAt: now() })
            }
          >
            MARQUER RÉCUPÉRÉE
          </button>
        )}
        {canTake && (
          <button className="workflow-accept" onClick={() => onTake(order)}>
            ACCEPTER LA LIVRAISON
          </button>
        )}
        {canRoute && (
          <button
            className="workflow-accept"
            onClick={() =>
              onTransition(order, "EN LIVRAISON", { inDeliveryAt: now() })
            }
          >
            DÉMARRER LA LIVRAISON
          </button>
        )}
        {canDeliver && (
          <button
            className="workflow-accept"
            onClick={() =>
              onTransition(order, "LIVRÉE", { deliveredAt: now() })
            }
          >
            LIVRÉE
          </button>
        )}
        {isAssignedDriver && order.customerPhone && <a className="workflow-call" href={`tel:${order.customerPhone}`}>APPELER LE CLIENT</a>}
        {isAssignedDriver && order.customerLatitude && order.customerLongitude && <a className="workflow-details" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${order.customerLatitude}&mlon=${order.customerLongitude}#map=16/${order.customerLatitude}/${order.customerLongitude}`}>OUVRIR L’ADRESSE</a>}
        {role === "admin" && (
          <select
            value={order.statusLabel || "NOUVELLE COMMANDE"}
            onChange={(event) =>
              onTransition(order, event.target.value, { adminUpdatedAt: now() })
            }
          >
            {(isPickup ? pickupStatuses : statuses).map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        )}
        {canSettleDriver && (
          <button
            type="button"
            className="workflow-accept"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSettleDriver();
            }}
          >
            ENCAISSER LIVREUR
          </button>
        )}
        <button className="workflow-details" onClick={onOpen}>
          Voir le détail
        </button>
      </div>
    </article>
  );
}

function DriverSections({ orders, driverId, onTake, onTransition }) {
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [success, setSuccess] = useState(false);
  const available = orders.filter((order) => order.statusLabel === "ACCEPTÉE PAR LE CAISSIER" && !order.driverId);
  const active = orders.filter((order) => order.driverId === driverId && ["PRISE PAR LE LIVREUR", "EN LIVRAISON"].includes(order.statusLabel));
  const completed = orders.filter((order) => order.driverId === driverId && order.statusLabel === "LIVRÉE");
  const groupedCollect = completed.reduce((groups, order) => {
    const day = new Date(order.deliveredAt || order.createdAt).toLocaleDateString("fr-FR");
    groups[day] = [...(groups[day] || []), order];
    return groups;
  }, {});
  const finishDelivery = (order) => {
    onTransition(order, "LIVRÉE", { deliveredAt: now(), paymentCollected: order.paymentMethod !== "Carte", paymentCollectedAt: order.paymentMethod !== "Carte" ? now() : null });
    setPaymentOrder(null); setSuccess(true); setTimeout(() => setSuccess(false), 2500);
  };
  return (
    <div className="driver-page-content">
      {success && <div className="driver-success">LIVRAISON TERMINÉE ✓</div>}
      <section className="driver-section"><div className="driver-section-head"><span>NOUVELLES LIVRAISONS</span><b>{available.length}</b></div>{available.length ? available.map((order) => <DriverAvailableCard key={order.id} order={order} onTake={onTake} />) : <div className="workflow-empty">Aucune nouvelle livraison.</div>}</section>
      <section className="driver-section driver-active-section"><div className="driver-section-head"><span>MA LIVRAISON</span><b>{active.length}</b></div>{active.length ? active.map((order) => <DriverActiveCard key={order.id} order={order} onTransition={onTransition} onComplete={() => order.paymentMethod === "Carte" ? finishDelivery(order) : setPaymentOrder(order)} />) : <div className="workflow-empty">Aucune livraison en cours.</div>}</section>
      <section className="driver-section"><div className="driver-section-head"><span>COLLECT</span><b>{completed.length}</b></div><Collect completed={completed} groups={groupedCollect} /></section>
      {paymentOrder && <div className="pos-overlay"><div className="pos-modal"><button className="pos-close" onClick={() => setPaymentOrder(null)}>×</button><span className="eyebrow">PAIEMENT À CONFIRMER</span><h2>Montant à encaisser: {paymentOrder.total} DH</h2><p>Confirmez la réception du paiement avant de terminer la livraison.</p><button className="pos-pay" onClick={() => finishDelivery(paymentOrder)}>PAIEMENT REÇU + TERMINER</button></div></div>}
    </div>
  );
}

function DriverAvailableCard({ order, onTake }) { return <article className="driver-order-card"><span className="workflow-status">NOUVELLE LIVRAISON DISPONIBLE</span><h2>#{order.id}</h2><p>{order.branchName || "Hanaa Food"}</p><p>{order.deliveryAddress ? order.deliveryAddress.split(",").slice(-2).join(", ") : "Zone à confirmer"}</p><div className="driver-order-meta"><b>{order.total} DH</b><span>Livraison {order.deliveryFee ?? 0} DH</span><span>{order.paymentMethod || "Espèces"}</span></div><button className="workflow-accept driver-primary" onClick={() => onTake(order)}>ACCEPTER</button></article>; }

function DriverActiveCard({ order, onTransition, onComplete }) { const isStarted = order.statusLabel === "EN LIVRAISON"; const collected = order.paymentMethod === "Carte" ? 0 : order.total; const mapUrl = order.customerLatitude && order.customerLongitude ? `https://www.openstreetmap.org/?mlat=${order.customerLatitude}&mlon=${order.customerLongitude}#map=16/${order.customerLatitude}/${order.customerLongitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress || "")}`; return <article className="driver-order-card driver-active-card"><span className="workflow-status">{order.statusLabel}</span><h2>#{order.id}</h2><div className="driver-detail-block"><b>CLIENT</b><strong>{order.customerName || "Client"}</strong><a href={`tel:${order.customerPhone}`}>{order.customerPhone || "Téléphone non renseigné"}</a><span>{order.deliveryAddress || "Adresse non renseignée"}</span></div><div className="driver-detail-block"><b>COMMANDE</b><span>{order.items?.map((item) => `${item.quantity} × ${item.name}${item.size ? ` (${item.size})` : ""}${item.sauce ? ` · Sauce: ${item.sauce}` : ""}`).join(", ") || "Commande"}</span></div><div className="driver-money"><span>Total commande <b>{order.total} DH</b></span><span>Livraison <b>{order.deliveryFee ?? 0} DH</b></span><strong>À ENCAISSER CHEZ LE CLIENT <b>{collected} DH</b></strong></div><div className="workflow-actions"><a className="workflow-call" href={`tel:${order.customerPhone}`}>APPELER LE CLIENT</a><a className="workflow-details" target="_blank" rel="noreferrer" href={mapUrl}>OUVRIR L’ADRESSE</a>{!isStarted ? <button className="workflow-accept driver-primary" onClick={() => onTransition(order, "EN LIVRAISON", { inDeliveryAt: now() })}>DÉMARRER LA LIVRAISON</button> : <button className="workflow-accept driver-primary" onClick={onComplete}>LIVRAISON TERMINÉE</button>}</div></article>; }

function Collect({ completed, groups }) { if (!completed.length) return <div className="workflow-empty">Aucune livraison terminée aujourd'hui.</div>; return Object.entries(groups).sort(([first], [second]) => new Date(second.split("/").reverse().join("-")) - new Date(first.split("/").reverse().join("-"))).map(([day, orders]) => { const total = orders.reduce((sum, order) => sum + order.total, 0); const fees = orders.reduce((sum, order) => sum + (order.deliveryFee ?? 0), 0); const cash = orders.reduce((sum, order) => sum + (order.paymentMethod === "Carte" ? 0 : order.total), 0); return <div className="collect-day" key={day}><h3>COLLECT — {day}</h3><div className="collect-totals"><span>Livraisons terminées <b>{orders.length}</b></span><span>Total commandes <b>{total} DH</b></span><span>Frais livraison <b>{fees} DH</b></span><span>Espèces encaissées <b>{cash} DH</b></span></div>{orders.sort((first, second) => new Date(second.deliveredAt || second.createdAt) - new Date(first.deliveredAt || first.createdAt)).map((order) => <div className="collect-row" key={order.id}><span>#{order.id} · {new Date(order.deliveredAt || order.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span><b>{order.total} DH</b><small>Livraison {order.deliveryFee ?? 0} DH · {order.paymentMethod || "Espèces"} · Encaissé {order.paymentMethod === "Carte" ? 0 : order.total} DH</small></div>)}</div>; }); }
function OrderDetail({ order, onClose }) {
  return (
    <div className="pos-overlay">
      <div className="pos-modal workflow-detail">
        <button className="pos-close" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">COMMANDE #{order.id}</span>
        <h2>{order.customerName || "Client"}</h2>
        {order.items?.map((item) => (
          <div
            className="workflow-detail-line"
            key={item.productId || item.name}
          >
            <span>
              {item.quantity} × {item.name}
              {(item.size || item.sauce) && (
                <small>
                  {item.size ? `Taille: ${item.size}` : ""}
                  {item.size && item.sauce ? " · " : ""}
                  {item.sauce ? `Sauce: ${item.sauce}` : ""}
                </small>
              )}
              <small>{item.price} DH / unité</small>
            </span>
            <b>{item.price * item.quantity} DH</b>
          </div>
        ))}
        <hr />
        <div className="workflow-detail-line">
          <strong>TOTAL</strong>
          <strong>{order.total} DH</strong>
        </div>
        <p className="muted">Statut: {order.statusLabel}</p>
      </div>
    </div>
  );
}

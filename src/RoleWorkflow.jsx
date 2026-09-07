import { useEffect, useMemo, useRef, useState } from "react";
import AdminNavigation from "./components/AdminNavigation";
import { signOut } from "./auth";

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
const readOrders = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("hanaa-orders") || "[]");
    const legacy = JSON.parse(localStorage.getItem("hanaa-order") || "null");

    if (Array.isArray(saved) && saved.length) return saved;
    return legacy ? [legacy] : [];
  } catch (error) {
    console.error("Impossible de lire les commandes:", error);
    return [];
  }
};
const saveOrders = (orders) =>
  localStorage.setItem("hanaa-orders", JSON.stringify(orders));
const now = () => new Date().toISOString();
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

export default function RoleWorkflow({ role, session, onHome, orderType, title, staffBranchId }) {
  const [orders, setOrders] = useState(readOrders);
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
  const hasSyncedOrders = useRef(false);
  const lastOrdersSnapshot = useRef("");
  const driverId = session?.id || null;
  const driverName = session?.name || "Livreur";

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
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
        order.orderType === "delivery" &&
        order.statusLabel === "ACCEPTÉE PAR LE CAISSIER" &&
        !order.driverId
      );
    };

    const notificationKey = (order) =>
      `${order.id}:${order.orderType}:${order.statusLabel}`;

    const sync = () => {
      const nextOrders = readOrders();
      const snapshot = JSON.stringify(nextOrders);

      // Never force a React re-render when nothing changed.
      if (snapshot === lastOrdersSnapshot.current && hasSyncedOrders.current) {
        return;
      }

      const unseenRelevantOrders = nextOrders.filter(
        (order) =>
          isRelevantForNotification(order) &&
          !knownOrderKeys.current.has(notificationKey(order)),
      );

      if (!hasSyncedOrders.current) {
        // Existing orders when the cashier opens the page are not "new".
        nextOrders.forEach((order) =>
          knownOrderKeys.current.add(notificationKey(order)),
        );
      } else if (unseenRelevantOrders.length) {
        const newestOrder = unseenRelevantOrders[0];

        if (role === "snack") {
          setNotification(
            newestOrder.orderType === "pickup"
              ? "NOUVELLE COMMANDE À EMPORTER"
              : "NOUVELLE COMMANDE LIVRAISON",
          );
        } else {
          setNotification("NOUVELLE LIVRAISON DISPONIBLE");
        }

        // Mark first so a failed/blocked sound never loops every polling cycle.
        unseenRelevantOrders.forEach((order) =>
          knownOrderKeys.current.add(notificationKey(order)),
        );

        if (audioEnabledRef.current) {
          void playNotificationTone(role);
        }
      }

      lastOrdersSnapshot.current = snapshot;
      hasSyncedOrders.current = true;
      setOrders(nextOrders);
    };

    sync();

    // Instant update between client/cashier tabs on the same origin.
    window.addEventListener("storage", sync);

    // Slow fallback only. It does not re-render if data did not change.
    const timer = setInterval(sync, 4000);

    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(timer);
    };
  }, [branchId, role]);

  const updateOrder = (orderId, updater) => {
    setOrders((currentOrders) => {
      const index = currentOrders.findIndex((order) => order.id === orderId);
      if (index < 0) return currentOrders;

      const updated = updater(currentOrders[index]);
      const next = currentOrders.map((order, itemIndex) =>
        itemIndex === index ? updated : order,
      );

      try {
        saveOrders(next);
        lastOrdersSnapshot.current = JSON.stringify(next);
      } catch (error) {
        console.error("Impossible de mettre à jour la commande:", error);
        return currentOrders;
      }

      return next;
    });
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
  const visibleOrders = useMemo(() => {
    const typed = activeOrderType
      ? orders.filter((order) => order.orderType === activeOrderType)
      : orders;
    if (role === "admin") return typed;
    if (role === "snack")
      return typed.filter((order) => order.branchId === branchId);
    return typed.filter((order) =>
      (order.statusLabel === "ACCEPTÉE PAR LE CAISSIER" && !order.driverId) ||
      order.driverId === driverId,
    );
  }, [activeOrderType, branchId, driverId, orders, role]);
  const accept = (order) => {
    if (order.orderType === "pickup") {
      transition(order, "VALIDÉE PAR LE SNACK", {
        cashierAcceptedBy: session?.id || `staff-${branchId}`,
        cashierAcceptedAt: now(),
        branchId,
      });
      return;
    }

    transition(order, "ACCEPTÉE PAR LE CAISSIER", {
      cashierAcceptedBy: session?.id || `staff-${branchId}`,
      cashierAcceptedAt: now(),
      branchId,
      driverQueueAt: now(),
    });
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
    const claim = () => {
      const current = readOrders();
      const index = current.findIndex((item) => item.id === order.id);
      const candidate = current[index];
      if (!candidate || candidate.statusLabel !== "ACCEPTÉE PAR LE CAISSIER" || candidate.driverId) return false;
      const updated = { ...candidate, driverId, driverName, driverTakenAt: now(), statusLabel: "PRISE PAR LE LIVREUR", statusHistory: [...(candidate.statusHistory || []), { status: "PRISE PAR LE LIVREUR", at: now(), driverId, driverName }] };
      const next = current.map((item, itemIndex) => itemIndex === index ? updated : item);
      saveOrders(next);
      setOrders(next);
      return true;
    };
    if (navigator.locks?.request) await navigator.locks.request(`hanaa-order-${order.id}`, { mode: "exclusive" }, claim);
    else claim();
  };

  return (
    <main className={`workflow-page workflow-${role}`}>
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
        <time>{new Date(order.createdAt).toLocaleString("fr-FR")}</time>
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
          {showPrivateDetails && <span>{order.items?.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</span>}
          <strong>{order.total} DH</strong>
          <span>{order.paymentMethod || "Paiement à la livraison"}</span>
          {!isPickup && (
            <span>Frais de livraison: {order.deliveryFee ?? 0} DH</span>
          )}
        </div>
      </div>
      {order.driverName && (
        <p className="workflow-assignment">
          Livreur: <b>{order.driverName}</b>
        </p>
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

function DriverActiveCard({ order, onTransition, onComplete }) { const isStarted = order.statusLabel === "EN LIVRAISON"; const collected = order.paymentMethod === "Carte" ? 0 : order.total; const mapUrl = order.customerLatitude && order.customerLongitude ? `https://www.openstreetmap.org/?mlat=${order.customerLatitude}&mlon=${order.customerLongitude}#map=16/${order.customerLatitude}/${order.customerLongitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress || "")}`; return <article className="driver-order-card driver-active-card"><span className="workflow-status">{order.statusLabel}</span><h2>#{order.id}</h2><div className="driver-detail-block"><b>CLIENT</b><strong>{order.customerName || "Client"}</strong><a href={`tel:${order.customerPhone}`}>{order.customerPhone || "Téléphone non renseigné"}</a><span>{order.deliveryAddress || "Adresse non renseignée"}</span></div><div className="driver-detail-block"><b>COMMANDE</b><span>{order.items?.map((item) => `${item.quantity} × ${item.name}`).join(", ") || "Commande"}</span></div><div className="driver-money"><span>Total commande <b>{order.total} DH</b></span><span>Livraison <b>{order.deliveryFee ?? 0} DH</b></span><strong>À ENCAISSER CHEZ LE CLIENT <b>{collected} DH</b></strong></div><div className="workflow-actions"><a className="workflow-call" href={`tel:${order.customerPhone}`}>APPELER LE CLIENT</a><a className="workflow-details" target="_blank" rel="noreferrer" href={mapUrl}>OUVRIR L’ADRESSE</a>{!isStarted ? <button className="workflow-accept driver-primary" onClick={() => onTransition(order, "EN LIVRAISON", { inDeliveryAt: now() })}>DÉMARRER LA LIVRAISON</button> : <button className="workflow-accept driver-primary" onClick={onComplete}>LIVRAISON TERMINÉE</button>}</div></article>; }

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

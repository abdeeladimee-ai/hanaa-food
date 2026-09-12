import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSnackOrder,
  listSnackOrders,
  saveSnackOrderStatus,
  subscribeSnackOrders,
} from "./snackOrdersApi";
import { signOut } from "./auth";

const now = () => new Date().toISOString();

const deliveryStatuses = [
  "NOUVELLE",
  "ACCEPTÉE PAR LE CAISSIER",
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

function statusFor(order) {
  return (
    order?.statusLabel ||
    (order?.orderType === "pickup" ? "NOUVELLE COMMANDE" : "NOUVELLE")
  );
}

export default function SnackOrdersLite({ session }) {
  const branchId = session?.branchId || "";
  const branchName = session?.branchName || "Hanaa Food";
  const [orders, setOrders] = useState([]);
  const [mode, setMode] = useState("delivery");
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const debounceRef = useRef(null);

  const loadOrders = async ({ quiet = false } = {}) => {
    if (!branchId) return;
    if (inFlightRef.current) {
      rerunRef.current = true;
      return;
    }

    inFlightRef.current = true;
    if (!quiet) setLoading(true);

    try {
      const next = await listSnackOrders(branchId);
      setOrders(next);
      setMessage((current) =>
        current.startsWith("Connexion aux commandes") ? "" : current,
      );
    } catch (error) {
      console.error("Snack orders load failed:", error);
      setMessage("Connexion aux commandes impossible. Réessayez.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      if (rerunRef.current) {
        rerunRef.current = false;
        void loadOrders({ quiet: true });
      }
    }
  };

  useEffect(() => {
    if (!branchId) return undefined;

    void loadOrders();

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeSnackOrders(branchId, () => {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          void loadOrders({ quiet: true });
        }, 350);
      });
    } catch (error) {
      console.error("Snack realtime failed:", error);
    }

    return () => {
      window.clearTimeout(debounceRef.current);
      unsubscribe();
    };
  }, [branchId]);

  const visible = useMemo(
    () => orders.filter((order) => order.orderType === mode),
    [orders, mode],
  );

  const setBusy = (id, value) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const saveStatus = async (order, nextStatus, extra = {}) => {
    if (!order?.id || busyIds.has(order.id)) return null;
    setBusy(order.id, true);
    setMessage("");

    try {
      const saved = await saveSnackOrderStatus(order.id, nextStatus, extra);
      setOrders((items) =>
        items.map((item) =>
          String(item.id) === String(saved.id) ? saved : item,
        ),
      );
      return saved;
    } catch (error) {
      console.error("Cashier status update failed:", error);
      setMessage("La commande ma tconfirmatch. Réessayez.");
      return null;
    } finally {
      setBusy(order.id, false);
    }
  };

  const accept = async (order) => {
    if (!order?.id || busyIds.has(order.id)) return;
    setBusy(order.id, true);
    setMessage("");

    try {
      const latest = await getSnackOrder(order.id);
      if (!latest) throw new Error("Commande introuvable");

      const isPickup = latest.orderType === "pickup";
      const expected = isPickup ? "NOUVELLE COMMANDE" : "NOUVELLE";

      if (statusFor(latest) !== expected) {
        setOrders((items) =>
          items.map((item) =>
            String(item.id) === String(latest.id) ? latest : item,
          ),
        );
        setMessage("Had commande deja tbdlat. T7aynat daba.");
        return;
      }

      const saved = await saveSnackOrderStatus(
        latest.id,
        isPickup ? "VALIDÉE PAR LE SNACK" : "ACCEPTÉE PAR LE CAISSIER",
        {
          cashierAcceptedBy: session?.id || `staff-${branchId}`,
          cashierAcceptedAt: now(),
          branchId,
          ...(isPickup ? {} : { driverQueueAt: now() }),
        },
      );

      setOrders((items) =>
        items.map((item) =>
          String(item.id) === String(saved.id) ? saved : item,
        ),
      );
      setMessage(`Commande #${saved.id} confirmée ✓`);
    } catch (error) {
      console.error("Cashier confirmation failed:", error);
      setMessage("La commande ma tconfirmatch. Réessayez.");
    } finally {
      setBusy(order.id, false);
    }
  };

  const refuse = async (order) => {
    const reason = window.prompt("Motif du refus ?");
    if (!reason?.trim()) return;

    const saved = await saveStatus(
      order,
      order.orderType === "pickup" ? "REFUSÉE PAR LE SNACK" : "REFUSÉE",
      {
        refusedBy: session?.id || `staff-${branchId}`,
        refusedAt: now(),
        refusalReason: reason.trim(),
      },
    );

    if (saved) setMessage(`Commande #${saved.id} refusée.`);
  };

  const advancePickup = async (order) => {
    const current = statusFor(order);
    if (current === "VALIDÉE PAR LE SNACK") {
      await saveStatus(order, "EN PRÉPARATION", { preparationStartedAt: now() });
    } else if (current === "EN PRÉPARATION") {
      await saveStatus(order, "PRÊTE", { readyAt: now() });
    } else if (current === "PRÊTE") {
      await saveStatus(order, "RÉCUPÉRÉE", { pickedUpAt: now() });
    }
  };

  const statuses = mode === "pickup" ? pickupStatuses : deliveryStatuses;

  return (
    <main className="workflow-page workflow-snack">
      <header className="workflow-header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{ width: 62, height: 62, objectFit: "contain" }}
          />
          <div>
            <small style={{ color: "#D71920", fontWeight: 900 }}>HANAA FOOD</small>
            <h1 style={{ margin: 0 }}>Commandes snack</h1>
          </div>
        </div>
        <button
          className="workflow-logout"
          onClick={() => {
            signOut();
            window.location.replace("/login");
          }}
        >
          Déconnexion
        </button>
      </header>

      <section className="workflow-filter-note">
        Branche active: <b>{branchName}</b>
      </section>

      <div className="workflow-actions" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={mode === "delivery" ? "workflow-accept" : "workflow-details"}
          onClick={() => setMode("delivery")}
        >
          LIVRAISON
        </button>
        <button
          type="button"
          className={mode === "pickup" ? "workflow-accept" : "workflow-details"}
          onClick={() => setMode("pickup")}
        >
          À EMPORTER
        </button>
        <button
          type="button"
          className="workflow-details"
          disabled={loading}
          onClick={() => void loadOrders()}
        >
          {loading ? "ACTUALISATION..." : "ACTUALISER"}
        </button>
      </div>

      {message && <div className="workflow-notification">{message}</div>}
      {loading && !orders.length && (
        <div className="workflow-empty">Chargement des commandes...</div>
      )}

      {statuses.map((status) => {
        const group = visible.filter((order) => statusFor(order) === status);
        return (
          <section className="workflow-orders workflow-status-group" key={status}>
            <div className="workflow-section-title">
              <div>
                <span className="workflow-status">{status}</span>
                <h2>{group.length} commande{group.length === 1 ? "" : "s"}</h2>
              </div>
              <span className="workflow-live">Live</span>
            </div>

            {group.length ? (
              group.map((order) => {
                const currentStatus = statusFor(order);
                const busy = busyIds.has(order.id);
                const canAccept =
                  currentStatus === "NOUVELLE" ||
                  currentStatus === "NOUVELLE COMMANDE";
                const canAdvancePickup =
                  order.orderType === "pickup" &&
                  ["VALIDÉE PAR LE SNACK", "EN PRÉPARATION", "PRÊTE"].includes(
                    currentStatus,
                  );
                const pickupLabel =
                  currentStatus === "VALIDÉE PAR LE SNACK"
                    ? "COMMENCER PRÉPARATION"
                    : currentStatus === "EN PRÉPARATION"
                      ? "MARQUER PRÊTE"
                      : "MARQUER RÉCUPÉRÉE";

                return (
                  <article className="workflow-card" key={order.id}>
                    <div className="workflow-card-top">
                      <div>
                        <b>#{order.id}</b>
                        <span className="workflow-status">{currentStatus}</span>
                      </div>
                      <time>
                        {new Date(order.createdAt || Date.now()).toLocaleString("fr-FR")}
                      </time>
                    </div>

                    <div className="workflow-card-grid">
                      <div>
                        <strong>{order.customerName || "Client"}</strong>
                        <span>{order.customerPhone || "Téléphone non renseigné"}</span>
                        <span>
                          {order.orderType === "pickup" ? "🥡 À emporter" : "🛵 Livraison"}
                        </span>
                        {order.orderType !== "pickup" && (
                          <span>{order.deliveryAddress || "Adresse non renseignée"}</span>
                        )}
                      </div>
                      <div>
                        <span>
                          {order.items
                            ?.map((item) => `${item.quantity || 1} × ${item.name}`)
                            .join(", ") || "Commande"}
                        </span>
                        <strong>{order.total ?? 0} DH</strong>
                        <span>{order.paymentMethod || "Paiement à la livraison"}</span>
                      </div>
                    </div>

                    <div className="workflow-actions">
                      {canAccept && (
                        <>
                          <button
                            type="button"
                            className="workflow-accept"
                            disabled={busy}
                            onClick={() => void accept(order)}
                          >
                            {busy ? "CONFIRMATION..." : "ACCEPTER"}
                          </button>
                          <button
                            type="button"
                            className="workflow-refuse"
                            disabled={busy}
                            onClick={() => void refuse(order)}
                          >
                            REFUSER
                          </button>
                        </>
                      )}
                      {canAdvancePickup && (
                        <button
                          type="button"
                          className="workflow-accept"
                          disabled={busy}
                          onClick={() => void advancePickup(order)}
                        >
                          {busy ? "ENREGISTREMENT..." : pickupLabel}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="workflow-empty">Aucune commande.</div>
            )}
          </section>
        );
      })}
    </main>
  );
}

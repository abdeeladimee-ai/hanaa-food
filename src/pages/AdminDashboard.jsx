import { useEffect, useMemo, useState } from "react";

const DEFAULT_ZONES = [
  { maxKm: 2, fee: 10 },
  { maxKm: 4, fee: 15 },
  { maxKm: 6, fee: 20 },
  { maxKm: 8, fee: 25 },
  { maxKm: 10, fee: 30 },
];

const defaultBranches = [
  {
    id: "tadart",
    name: "Hanaa Food Tadart",
    address: "Tadart",
    latitude: 33.533533,
    longitude: -7.616479,
    phone: "",
    isOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryRadiusKm: 10,
    deliveryZones: DEFAULT_ZONES,
    deliveryPricingSettings: {
      baseFee: 10,
      pricePerKm: 2,
      minimumFee: 10,
      maximumDistanceKm: 10,
      freeDeliveryThreshold: 150,
    },
  },
  {
    id: "amgala",
    name: "Hanaa Food Amgala",
    address: "Amgala",
    latitude: 33.544571852751574,
    longitude: -7.5862466958914645,
    phone: "",
    isOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryRadiusKm: 10,
    deliveryZones: DEFAULT_ZONES,
    deliveryPricingSettings: {
      baseFee: 10,
      pricePerKm: 2,
      minimumFee: 10,
      maximumDistanceKm: 10,
      freeDeliveryThreshold: 150,
    },
  },
  {
    id: "rue-baghdad",
    name: "Hanaa Food Rue Baghdad",
    address: "Rue Baghdad",
    latitude: 33.54931724246645,
    longitude: -7.594107720391539,
    phone: "",
    isOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryRadiusKm: 10,
    deliveryZones: DEFAULT_ZONES,
    deliveryPricingSettings: {
      baseFee: 10,
      pricePerKm: 2,
      minimumFee: 10,
      maximumDistanceKm: 10,
      freeDeliveryThreshold: 150,
    },
  },
];

const readOrders = () => {
  try {
    const data = JSON.parse(localStorage.getItem("hanaa-orders") || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const normalizeZones = (savedZones) => {
  const saved = Array.isArray(savedZones) ? savedZones : [];

  return DEFAULT_ZONES.map((zone) => {
    const existing = saved.find(
      (item) => Number(item?.maxKm) === Number(zone.maxKm),
    );

    return {
      maxKm: zone.maxKm,
      fee: Number(existing?.fee ?? zone.fee),
    };
  });
};

const readBranches = () => {
  let saved = [];

  try {
    const parsed = JSON.parse(localStorage.getItem("hanaa-branches") || "[]");
    saved = Array.isArray(parsed) ? parsed : [];
  } catch {
    saved = [];
  }

  return defaultBranches.map((fallback) => {
    const existing = saved.find((item) => item?.id === fallback.id) || {};

    const maximumDistanceKm = Number(
      existing?.deliveryPricingSettings?.maximumDistanceKm ??
        existing?.deliveryRadiusKm ??
        fallback.deliveryPricingSettings.maximumDistanceKm,
    );

    return {
      ...fallback,
      ...existing,
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      isOpen: true,
      deliveryEnabled: existing.deliveryEnabled ?? fallback.deliveryEnabled,
      pickupEnabled: existing.pickupEnabled ?? fallback.pickupEnabled,
      deliveryRadiusKm: Number.isFinite(maximumDistanceKm)
        ? maximumDistanceKm
        : 10,
      deliveryZones: normalizeZones(existing.deliveryZones),
      deliveryPricingSettings: {
        ...fallback.deliveryPricingSettings,
        ...(existing.deliveryPricingSettings || {}),
        maximumDistanceKm: Number.isFinite(maximumDistanceKm)
          ? maximumDistanceKm
          : 10,
      },
    };
  });
};

const isToday = (value) => {
  if (!value) return false;

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

const dh = (value) => `${Math.round(Number(value || 0))} DH`;

const branchNames = {
  tadart: "Hanaa Food Tadart",
  amgala: "Hanaa Food Amgala",
  "rue-baghdad": "Hanaa Food Rue Baghdad",
};

export default function AdminDashboard({ onNavigate }) {
  const [orders, setOrders] = useState(readOrders);
  const [branchSettings, setBranchSettings] = useState(readBranches);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const sync = () => setOrders(readOrders());

    window.addEventListener("storage", sync);
    const timer = setInterval(sync, 4000);

    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(timer);
    };
  }, []);

  const todayOrders = useMemo(
    () => orders.filter((order) => isToday(order.createdAt)),
    [orders],
  );

  const deliveredToday = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.statusLabel === "LIVRÉE" &&
          isToday(order.deliveredAt || order.createdAt),
      ),
    [orders],
  );

  const pickupToday = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.statusLabel === "RÉCUPÉRÉE" &&
          isToday(order.pickedUpAt || order.createdAt),
      ),
    [orders],
  );

  const revenue = [...deliveredToday, ...pickupToday].reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );

  const cashDrivers = deliveredToday.reduce(
    (sum, order) =>
      sum + (order.paymentMethod === "Carte" ? 0 : Number(order.total || 0)),
    0,
  );

  const deliveryFees = deliveredToday.reduce(
    (sum, order) => sum + Number(order.deliveryFee || 0),
    0,
  );

  const activeDeliveries = orders.filter((order) =>
    ["ACCEPTÉE PAR LE CAISSIER", "PRISE PAR LE LIVREUR", "EN LIVRAISON"].includes(
      order.statusLabel,
    ),
  );

  const waitingSnack = orders.filter((order) =>
    ["NOUVELLE", "NOUVELLE COMMANDE"].includes(order.statusLabel),
  );

  const driverStats = useMemo(() => {
    const drivers = new Map();

    orders.forEach((order) => {
      if (!order.driverId && !order.driverName) return;

      const id = order.driverId || order.driverName;
      const item = drivers.get(id) || {
        id,
        name: order.driverName || "Livreur",
        delivered: 0,
        active: 0,
        total: 0,
        fees: 0,
        cash: 0,
      };

      if (
        order.statusLabel === "LIVRÉE" &&
        isToday(order.deliveredAt || order.createdAt)
      ) {
        item.delivered += 1;
        item.total += Number(order.total || 0);
        item.fees += Number(order.deliveryFee || 0);
        item.cash +=
          order.paymentMethod === "Carte" ? 0 : Number(order.total || 0);
      }

      if (
        ["PRISE PAR LE LIVREUR", "EN LIVRAISON"].includes(order.statusLabel)
      ) {
        item.active += 1;
      }

      drivers.set(id, item);
    });

    return [...drivers.values()].sort((a, b) => b.delivered - a.delivered);
  }, [orders]);

  const branchStats = useMemo(
    () =>
      Object.entries(branchNames).map(([id, name]) => {
        const list = todayOrders.filter((order) => order.branchId === id);

        const done = list.filter((order) =>
          ["LIVRÉE", "RÉCUPÉRÉE"].includes(order.statusLabel),
        );

        return {
          id,
          name,
          count: list.length,
          done: done.length,
          waiting: list.filter((order) =>
            ["NOUVELLE", "NOUVELLE COMMANDE"].includes(order.statusLabel),
          ).length,
          revenue: done.reduce(
            (sum, order) => sum + Number(order.total || 0),
            0,
          ),
        };
      }),
    [todayOrders],
  );

  const latest = useMemo(
    () =>
      [...orders]
        .sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
        )
        .slice(0, 8),
    [orders],
  );

  const updateBranch = (branchId, patch) => {
    setBranchSettings((current) =>
      current.map((branch) =>
        branch.id === branchId
          ? {
              ...branch,
              ...(typeof patch === "function" ? patch(branch) : patch),
            }
          : branch,
      ),
    );
    setSavedMessage("");
  };

  const updateZoneFee = (branchId, maxKm, fee) => {
    const safeFee = Math.max(0, Number(fee) || 0);

    updateBranch(branchId, (branch) => ({
      deliveryZones: normalizeZones(branch.deliveryZones).map((zone) =>
        zone.maxKm === maxKm ? { ...zone, fee: safeFee } : zone,
      ),
    }));
  };

  const updateMaxDistance = (branchId, value) => {
    const maximumDistanceKm = Math.min(10, Math.max(1, Number(value) || 1));

    updateBranch(branchId, (branch) => ({
      deliveryRadiusKm: maximumDistanceKm,
      deliveryPricingSettings: {
        ...branch.deliveryPricingSettings,
        maximumDistanceKm,
      },
    }));
  };

  const saveBranchSettings = () => {
    const clean = branchSettings.map((branch) => ({
      ...branch,
      isOpen: true,
      deliveryRadiusKm: Number(
        branch.deliveryPricingSettings?.maximumDistanceKm || 10,
      ),
      deliveryZones: normalizeZones(branch.deliveryZones),
      deliveryPricingSettings: {
        ...branch.deliveryPricingSettings,
        maximumDistanceKm: Number(
          branch.deliveryPricingSettings?.maximumDistanceKm || 10,
        ),
      },
    }));

    localStorage.setItem("hanaa-branches", JSON.stringify(clean));
    setBranchSettings(clean);
    setSavedMessage("✅ Paramètres enregistrés");
    window.dispatchEvent(new Event("hanaa-branches-updated"));
  };

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{
              width: 82,
              height: 82,
              objectFit: "contain",
              borderRadius: 16,
              background: "#fff",
              flexShrink: 0,
            }}
          />
          <div>
            <small style={s.label}>ADMINISTRATION</small>
            <h1 style={s.title}>Dashboard Hanaa Food</h1>
            <p style={s.muted}>
              Commandes, restaurants, livreurs et encaissements en direct.
            </p>
          </div>
        </div>

        <span style={s.live}>● LIVE</span>
      </header>

      <div style={s.actions}>
        <button
          style={s.primary}
          onClick={() => onNavigate("/admin/commandes-livraison")}
        >
          Livraisons
        </button>

        <button
          style={s.button}
          onClick={() => onNavigate("/admin/commandes-emporter")}
        >
          À emporter
        </button>

        <button
          style={s.button}
          onClick={() => onNavigate("/admin/livreurs")}
        >
          Livreurs
        </button>

        <button
          style={s.button}
          onClick={() => onNavigate("/admin/utilisateurs")}
        >
          + Ajouter caissier / livreur
        </button>
      </div>

      <Box title="Paramètres des restaurants">
        <p style={s.help}>
          Hna nta li kat7edded wach kol branche fiha livraison wla la, wach fiha
          à emporter wla la, distance maximale w taman dyal livraison. L7ed howa 10 km.
        </p>

        <div style={s.settingsGrid}>
          {branchSettings.map((branch) => (
            <article key={branch.id} style={s.settingsCard}>
              <div style={s.settingsHead}>
                <div>
                  <h3 style={s.settingsTitle}>{branch.name}</h3>
                  <span style={s.muted}>{branch.address}</span>
                </div>

                <span
                  style={{
                    ...s.stateBadge,
                    ...s.stateOn,
                  }}
                >
                  ACTIVE
                </span>
              </div>

              <div style={s.serviceGrid}>
                <label style={s.serviceField}>
                  <span>Livraison</span>
                  <select
                    style={s.serviceSelect}
                    value={branch.deliveryEnabled ? "on" : "off"}
                    onChange={(event) =>
                      updateBranch(branch.id, {
                        deliveryEnabled: event.target.value === "on",
                      })
                    }
                  >
                    <option value="on">✅ Disponible</option>
                    <option value="off">⛔ Désactivée</option>
                  </select>
                </label>

                <label style={s.serviceField}>
                  <span>À emporter</span>
                  <select
                    style={s.serviceSelect}
                    value={branch.pickupEnabled ? "on" : "off"}
                    onChange={(event) =>
                      updateBranch(branch.id, {
                        pickupEnabled: event.target.value === "on",
                      })
                    }
                  >
                    <option value="on">✅ Disponible</option>
                    <option value="off">⛔ Désactivé</option>
                  </select>
                </label>
              </div>

              <label style={s.fieldLabel}>
                Distance maximale de livraison
                <div style={s.inputRow}>
                  <input
                    style={s.numberInput}
                    type="number"
                    min="1"
                    max="10"
                    step="1"
                    value={
                      branch.deliveryPricingSettings?.maximumDistanceKm ?? 10
                    }
                    onChange={(event) =>
                      updateMaxDistance(branch.id, event.target.value)
                    }
                  />
                  <span style={s.unit}>KM</span>
                </div>
              </label>

              <div style={s.zonesBox}>
                <strong style={s.zoneHeading}>Prix par zone</strong>

                {normalizeZones(branch.deliveryZones).map((zone, index) => {
                  const previousKm =
                    index === 0 ? 0 : normalizeZones(branch.deliveryZones)[index - 1].maxKm;

                  return (
                    <div key={zone.maxKm} style={s.zoneRow}>
                      <span>
                        {previousKm} - {zone.maxKm} km
                      </span>

                      <div style={s.priceInputWrap}>
                        <input
                          style={s.priceInput}
                          type="number"
                          min="0"
                          step="1"
                          value={zone.fee}
                          onChange={(event) =>
                            updateZoneFee(
                              branch.id,
                              zone.maxKm,
                              event.target.value,
                            )
                          }
                        />
                        <span>DH</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <small style={s.rule}>
                Ila distance fat{" "}
                <b>
                  {branch.deliveryPricingSettings?.maximumDistanceKm ?? 10} km
                </b>
                , client ghadi ychouf “Hors zone de livraison”.
              </small>
            </article>
          ))}
        </div>

        <div style={s.saveRow}>
          <button style={s.saveButton} onClick={saveBranchSettings}>
            ENREGISTRER LES PARAMÈTRES
          </button>

          {savedMessage && <strong style={s.saved}>{savedMessage}</strong>}
        </div>
      </Box>

      <section style={s.kpis}>
        <Kpi
          title="COMMANDES AUJOURD’HUI"
          value={todayOrders.length}
          text={`${deliveredToday.length + pickupToday.length} terminées`}
        />
        <Kpi
          title="CA TERMINÉ"
          value={dh(revenue)}
          text="Livraison + à emporter"
        />
        <Kpi
          title="ESPÈCES CHEZ LIVREURS"
          value={dh(cashDrivers)}
          text="À contrôler dans le collect"
        />
        <Kpi
          title="FRAIS LIVRAISON"
          value={dh(deliveryFees)}
          text={`${deliveredToday.length} livraisons`}
        />
        <Kpi
          title="LIVRAISONS EN COURS"
          value={activeDeliveries.length}
          text="Acceptées / prises / route"
        />
        <Kpi
          title="ATTENTE SNACK"
          value={waitingSnack.length}
          text="À accepter ou refuser"
        />
      </section>

      <Box title="Livreurs — aujourd’hui">
        {driverStats.length ? (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <Th>Livreur</Th>
                  <Th>Livrées</Th>
                  <Th>En cours</Th>
                  <Th>Total commandes</Th>
                  <Th>Frais</Th>
                  <Th>Espèces en main</Th>
                </tr>
              </thead>

              <tbody>
                {driverStats.map((driver) => (
                  <tr key={driver.id}>
                    <Td>
                      <b>{driver.name}</b>
                      <small style={s.id}>{driver.id}</small>
                    </Td>
                    <Td>{driver.delivered}</Td>
                    <Td>{driver.active}</Td>
                    <Td>{dh(driver.total)}</Td>
                    <Td>{dh(driver.fees)}</Td>
                    <Td>
                      <b>{dh(driver.cash)}</b>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={s.empty}>Aucune activité livreur aujourd’hui.</div>
        )}
      </Box>

      <Box title="Restaurants — aujourd’hui">
        <div style={s.branches}>
          {branchStats.map((branch) => (
            <article key={branch.id} style={s.branch}>
              <h3>{branch.name}</h3>
              <Line name="Commandes" value={branch.count} />
              <Line name="Terminées" value={branch.done} />
              <Line name="En attente" value={branch.waiting} />
              <Line name="CA terminé" value={dh(branch.revenue)} strong />
            </article>
          ))}
        </div>
      </Box>

      <Box title="Dernières commandes">
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <Th>Commande</Th>
                <Th>Type</Th>
                <Th>Branche</Th>
                <Th>Client</Th>
                <Th>Total</Th>
                <Th>Statut</Th>
                <Th>Livreur</Th>
              </tr>
            </thead>

            <tbody>
              {latest.map((order) => (
                <tr key={order.id}>
                  <Td>
                    <b>#{order.id}</b>
                  </Td>
                  <Td>
                    {order.orderType === "pickup" ? "À emporter" : "Livraison"}
                  </Td>
                  <Td>
                    {order.branchName || branchNames[order.branchId] || "—"}
                  </Td>
                  <Td>{order.customerName || "Client"}</Td>
                  <Td>
                    <b>{dh(order.total)}</b>
                  </Td>
                  <Td>{order.statusLabel || "—"}</Td>
                  <Td>{order.driverName || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
    </main>
  );
}

function Kpi({ title, value, text }) {
  return (
    <article style={s.kpi}>
      <small style={s.label}>{title}</small>
      <strong style={s.value}>{value}</strong>
      <span style={s.muted}>{text}</span>
    </article>
  );
}

function Box({ title, children }) {
  return (
    <section style={s.box}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Line({ name, value, strong }) {
  return (
    <div style={s.line}>
      <span>{name}</span>
      {strong ? <strong>{value}</strong> : <b>{value}</b>}
    </div>
  );
}

function Th({ children }) {
  return <th style={s.th}>{children}</th>;
}

function Td({ children }) {
  return <td style={s.td}>{children}</td>;
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#fff6f6",
    padding: 28,
    color: "#351417",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  header: {
    maxWidth: 1400,
    margin: "0 auto 20px",
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
  },
  label: {
    display: "block",
    fontSize: 11,
    letterSpacing: "0.12em",
    fontWeight: 900,
    color: "#777",
  },
  title: {
    margin: "5px 0",
    fontSize: 42,
  },
  muted: {
    color: "#777",
    fontSize: 13,
  },
  live: {
    height: "fit-content",
    background: "#fff",
    border: "1px solid #f0d6d8",
    borderRadius: 999,
    padding: "9px 13px",
    fontSize: 12,
    fontWeight: 900,
  },
  actions: {
    maxWidth: 1400,
    margin: "0 auto 20px",
    display: "flex",
    gap: 9,
    flexWrap: "wrap",
  },
  primary: {
    border: 0,
    background: "#D71920",
    color: "#fff",
    borderRadius: 11,
    padding: "12px 17px",
    fontWeight: 800,
    cursor: "pointer",
  },
  button: {
    border: "1px solid #f0d6d8",
    background: "#fff",
    color: "#351417",
    borderRadius: 11,
    padding: "12px 17px",
    fontWeight: 800,
    cursor: "pointer",
  },
  kpis: {
    maxWidth: 1400,
    margin: "0 auto 20px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))",
    gap: 12,
  },
  kpi: {
    background: "#fff",
    border: "1px solid #f0d6d8",
    borderRadius: 17,
    padding: 18,
  },
  value: {
    display: "block",
    fontSize: 29,
    margin: "8px 0 5px",
  },
  box: {
    maxWidth: 1400,
    margin: "0 auto 20px",
    background: "#fff",
    border: "1px solid #f0d6d8",
    borderRadius: 18,
    padding: 20,
  },
  help: {
    margin: "-6px 0 18px",
    color: "#7b6466",
    lineHeight: 1.5,
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: 14,
  },
  settingsCard: {
    border: "1px solid #f0d6d8",
    background: "#fffafa",
    borderRadius: 17,
    padding: 17,
  },
  settingsHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  settingsTitle: {
    margin: "0 0 3px",
    fontSize: 18,
  },
  stateBadge: {
    borderRadius: 999,
    padding: "6px 9px",
    fontSize: 10,
    fontWeight: 900,
  },
  stateOn: {
    background: "#D71920",
    color: "#fff",
  },
  stateOff: {
    background: "#eadfe0",
    color: "#76585b",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #f3e3e4",
    fontWeight: 800,
  },
  toggle: {
    width: 48,
    height: 26,
    border: 0,
    borderRadius: 999,
    padding: 3,
    cursor: "pointer",
    transition: "background .2s ease",
  },
  toggleOn: {
    background: "#D71920",
  },
  toggleOff: {
    background: "#d7c7c8",
  },
  toggleKnob: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#fff",
    transition: "transform .2s ease",
    boxShadow: "0 1px 4px rgba(0,0,0,.18)",
  },
  serviceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 14,
  },
  serviceField: {
    display: "grid",
    gap: 7,
    fontWeight: 800,
    fontSize: 13,
  },
  serviceSelect: {
    width: "100%",
    border: "1px solid #e7c8ca",
    background: "#fff",
    color: "#351417",
    borderRadius: 10,
    padding: "10px 11px",
    fontWeight: 800,
    cursor: "pointer",
  },
  fieldLabel: {
    display: "grid",
    gap: 7,
    marginTop: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  numberInput: {
    flex: 1,
    minWidth: 0,
    border: "1px solid #e7c8ca",
    background: "#fff",
    borderRadius: 10,
    padding: "11px 12px",
    fontSize: 16,
    fontWeight: 800,
  },
  unit: {
    background: "#fff0f1",
    color: "#D71920",
    borderRadius: 9,
    padding: "11px 12px",
    fontWeight: 900,
  },
  zonesBox: {
    marginTop: 15,
    borderTop: "1px solid #f0d6d8",
    paddingTop: 13,
  },
  zoneHeading: {
    display: "block",
    marginBottom: 8,
  },
  zoneRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "7px 0",
  },
  priceInputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#D71920",
    fontWeight: 900,
  },
  priceInput: {
    width: 64,
    border: "1px solid #e7c8ca",
    background: "#fff",
    borderRadius: 8,
    padding: "8px",
    textAlign: "center",
    fontWeight: 900,
  },
  rule: {
    display: "block",
    marginTop: 12,
    color: "#856c6e",
    lineHeight: 1.45,
  },
  saveRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 18,
  },
  saveButton: {
    border: 0,
    background: "#D71920",
    color: "#fff",
    borderRadius: 11,
    padding: "13px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },
  saved: {
    color: "#D71920",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 800,
  },
  th: {
    textAlign: "left",
    padding: 11,
    borderBottom: "1px solid #ddd",
    fontSize: 11,
    color: "#777",
  },
  td: {
    padding: 12,
    borderBottom: "1px solid #eee",
    fontSize: 14,
  },
  id: {
    display: "block",
    color: "#999",
    marginTop: 3,
  },
  branches: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },
  branch: {
    background: "#fffafa",
    border: "1px solid #f0d6d8",
    borderRadius: 15,
    padding: 16,
  },
  line: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #eee",
  },
  empty: {
    background: "#fff6f6",
    borderRadius: 12,
    padding: 22,
    textAlign: "center",
    color: "#777",
  },
};

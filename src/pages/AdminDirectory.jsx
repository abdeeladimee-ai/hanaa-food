import { useEffect, useMemo, useState } from "react";
import {
  addStaffAccount,
  deleteStaffAccount,
  getStaffAccounts,
  toggleStaffAccount,
} from "../auth";

const branches = [
  { id: "tadart", name: "Hanaa Food Tadart" },
  { id: "amgala", name: "Hanaa Food Amgala" },
  { id: "rue-baghdad", name: "Hanaa Food Rue Baghdad" },
];

export default function AdminDirectory({ type, onNavigate }) {
  const onlyDrivers = type === "drivers";
  const [accounts, setAccounts] = useState(getStaffAccounts);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    role: onlyDrivers ? "LIVREUR" : "SNACK",
    branchId: "tadart",
  });
  const [message, setMessage] = useState("");

  const refresh = () => setAccounts(getStaffAccounts());

  useEffect(() => {
    const sync = () => refresh();
    window.addEventListener("hanaa-staff-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hanaa-staff-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const visible = useMemo(
    () =>
      onlyDrivers
        ? accounts.filter((item) => item.role === "LIVREUR")
        : accounts,
    [accounts, onlyDrivers],
  );

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    const result = addStaffAccount({
      ...form,
      role: onlyDrivers ? "LIVREUR" : form.role,
    });

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage("Compte tzad b succès ✅");
    setForm({
      name: "",
      phone: "",
      password: "",
      role: onlyDrivers ? "LIVREUR" : "SNACK",
      branchId: "tadart",
    });
    refresh();
  };

  const currentRole = onlyDrivers ? "LIVREUR" : form.role;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{
              width: 76,
              height: 76,
              objectFit: "contain",
              borderRadius: 15,
              background: "#fff",
              flexShrink: 0,
            }}
          />
          <div>
            <p style={s.eyebrow}>ADMINISTRATION</p>
            <h1 style={s.title}>
              {onlyDrivers ? "Gestion des livreurs" : "Gestion de l’équipe"}
            </h1>
            <p style={s.sub}>
              Nta admin: nta li katzid caissier/livreur w nta li kat7edded compte dyalou.
            </p>
          </div>
        </div>

        <button style={s.outline} onClick={() => onNavigate("/admin")}>
          Dashboard
        </button>
      </header>

      <section style={s.box}>
        <h2 style={s.h2}>Ajouter un membre</h2>

        <form onSubmit={submit} style={s.form}>
          <label style={s.label}>
            Smya
            <input
              style={s.input}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Ex: Youssef"
              required
            />
          </label>

          <label style={s.label}>
            Numéro téléphone
            <input
              style={s.input}
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="06XXXXXXXX"
              required
            />
          </label>

          <label style={s.label}>
            Mot de passe
            <input
              style={s.input}
              type="text"
              minLength={4}
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              placeholder="Nta li kat3tih lih"
              required
            />
          </label>

          {!onlyDrivers && (
            <label style={s.label}>
              Rôle
              <select
                style={s.input}
                value={form.role}
                onChange={(event) => update("role", event.target.value)}
              >
                <option value="SNACK">Caissier</option>
                <option value="LIVREUR">Livreur</option>
              </select>
            </label>
          )}

          {currentRole === "SNACK" && (
            <label style={s.label}>
              Branche
              <select
                style={s.input}
                value={form.branchId}
                onChange={(event) => update("branchId", event.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button type="submit" style={s.primary}>
            + AJOUTER LE COMPTE
          </button>
        </form>

        {message && <div style={s.message}>{message}</div>}
      </section>

      <section style={s.box}>
        <div style={s.sectionHead}>
          <h2 style={s.h2}>
            {onlyDrivers ? "Livreurs" : "Caissiers & livreurs"}
          </h2>
          <span style={s.count}>{visible.length}</span>
        </div>

        {visible.length ? (
          <div style={s.grid}>
            {visible.map((account) => (
              <article key={account.id} style={s.card}>
                <div style={s.cardTop}>
                  <div>
                    <strong style={s.name}>{account.name}</strong>
                    <span style={s.phone}>{account.phone}</span>
                  </div>
                  <span style={s.role}>
                    {account.role === "SNACK" ? "CAISSIER" : "LIVREUR"}
                  </span>
                </div>

                {account.role === "SNACK" && (
                  <p style={s.branch}>{account.branchName}</p>
                )}

                <div style={s.statusRow}>
                  <span>
                    Statut:{" "}
                    <b>{account.active === false ? "Désactivé" : "Actif"}</b>
                  </span>
                  <span>ID: {account.id}</span>
                </div>

                <div style={s.cardActions}>
                  <button
                    style={s.secondary}
                    onClick={() => {
                      toggleStaffAccount(account.id);
                      refresh();
                    }}
                  >
                    {account.active === false ? "ACTIVER" : "DÉSACTIVER"}
                  </button>

                  <button
                    style={s.danger}
                    onClick={() => {
                      if (window.confirm(`Supprimer ${account.name} ?`)) {
                        deleteStaffAccount(account.id);
                        refresh();
                      }
                    }}
                  >
                    SUPPRIMER
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={s.empty}>Mazal ma زدتي ta compte mn hna.</div>
        )}
      </section>
    </main>
  );
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
    maxWidth: 1350,
    margin: "0 auto 20px",
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-start",
  },
  eyebrow: {
    margin: 0,
    color: "#D71920",
    fontWeight: 900,
    letterSpacing: ".12em",
    fontSize: 12,
  },
  title: { margin: "5px 0", fontSize: 38 },
  sub: { margin: 0, color: "#866b6d" },
  outline: {
    border: "1px solid #D71920",
    background: "#fff",
    color: "#D71920",
    borderRadius: 12,
    padding: "11px 16px",
    fontWeight: 900,
    cursor: "pointer",
  },
  box: {
    maxWidth: 1350,
    margin: "0 auto 18px",
    background: "#fff",
    border: "1px solid #f0d6d8",
    borderRadius: 18,
    padding: 20,
  },
  h2: { margin: 0, fontSize: 23 },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
    marginTop: 18,
    alignItems: "end",
  },
  label: {
    display: "grid",
    gap: 7,
    color: "#5e3a3d",
    fontWeight: 800,
    fontSize: 13,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #e7c8ca",
    borderRadius: 11,
    padding: "12px 13px",
    background: "#fff",
    fontSize: 15,
  },
  primary: {
    border: 0,
    borderRadius: 11,
    padding: "13px 16px",
    background: "#D71920",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  message: {
    marginTop: 14,
    padding: 11,
    borderRadius: 10,
    background: "#fff0f1",
    border: "1px solid #f0c8cb",
    color: "#a70e16",
    fontWeight: 800,
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  count: {
    background: "#D71920",
    color: "#fff",
    borderRadius: 999,
    minWidth: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid #f0d6d8",
    borderRadius: 15,
    padding: 16,
    background: "#fffafa",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },
  name: { display: "block", fontSize: 18 },
  phone: { display: "block", color: "#866b6d", marginTop: 4 },
  role: {
    background: "#D71920",
    color: "#fff",
    borderRadius: 999,
    height: "fit-content",
    padding: "6px 9px",
    fontSize: 10,
    fontWeight: 900,
  },
  branch: {
    background: "#fff0f1",
    padding: 9,
    borderRadius: 9,
    color: "#8f1a20",
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    fontSize: 12,
    color: "#866b6d",
  },
  cardActions: { display: "flex", gap: 8, marginTop: 14 },
  secondary: {
    flex: 1,
    border: "1px solid #D71920",
    color: "#D71920",
    background: "#fff",
    borderRadius: 9,
    padding: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  danger: {
    flex: 1,
    border: 0,
    color: "#fff",
    background: "#D71920",
    borderRadius: 9,
    padding: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  empty: {
    padding: 24,
    borderRadius: 12,
    background: "#fff6f6",
    color: "#866b6d",
    textAlign: "center",
  },
};

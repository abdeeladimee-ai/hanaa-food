import { useState } from "react";
import { signIn } from "../auth";

export default function Login({ onSuccess }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    setError("");

    const session = signIn(identifier, password);

    if (!session) {
      setError("Téléphone / email ou mot de passe incorrect.");
      return;
    }

    onSuccess(session);
  };

  return (
    <main style={styles.page}>
      <form onSubmit={submit} style={styles.card}>
        <img
          src="/hanaa-logo.png"
          alt="Hanaa Food"
          style={{
            width: 110,
            height: 110,
            objectFit: "contain",
            display: "block",
            margin: "0 auto 10px",
          }}
        />
        <p style={{ ...styles.eyebrow, textAlign: "center" }}>HANAA FOOD</p>
        <h1 style={styles.title}>Connexion équipe</h1>
        <p style={styles.text}>
          Dkhol b numéro téléphone li zed lik admin w mot de passe.
        </p>

        <label style={styles.label}>
          Téléphone ou email
          <input
            style={styles.input}
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="06XXXXXXXX"
            autoComplete="username"
            required
          />
        </label>

        <label style={styles.label}>
          Mot de passe
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" style={styles.button}>
          SE CONNECTER
        </button>
      </form>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "#fff6f6",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    width: "min(430px, 100%)",
    background: "#fff",
    border: "1px solid #f0d6d8",
    borderRadius: 22,
    padding: 28,
    boxShadow: "0 18px 50px rgba(120,0,0,.08)",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "#D71920",
    color: "#fff",
    fontWeight: 900,
    fontSize: 24,
  },
  eyebrow: {
    margin: "18px 0 5px",
    color: "#D71920",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: ".12em",
  },
  title: { margin: 0, fontSize: 32, color: "#351417" },
  text: { color: "#866b6d", marginBottom: 22 },
  label: {
    display: "grid",
    gap: 7,
    marginBottom: 15,
    fontWeight: 800,
    color: "#351417",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #e6c8ca",
    borderRadius: 12,
    padding: "13px 14px",
    fontSize: 16,
    outline: "none",
    background: "#fff",
  },
  button: {
    width: "100%",
    border: 0,
    borderRadius: 12,
    padding: "14px 16px",
    background: "#D71920",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 5,
  },
  error: {
    background: "#fff0f1",
    color: "#a50f17",
    border: "1px solid #f2c8cb",
    borderRadius: 10,
    padding: 11,
    marginBottom: 13,
    fontSize: 14,
  },
};

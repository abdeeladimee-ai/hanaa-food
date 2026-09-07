import { useState } from "react";
import { signIn } from "../auth";

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const session = signIn(email, password);
    if (!session) { setError("Email ou mot de passe incorrect."); return; }
    onSuccess(session);
  };
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand login-brand"><span>H</span> HANAA <b>FOOD</b></div><span className="eyebrow">ESPACE ÉQUIPE</span><h1>Connexion</h1><p>Votre rôle ouvre automatiquement l'espace correspondant.</p><label>Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@hanaa-food.test" /></label><label>Mot de passe<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Votre mot de passe" /></label>{error && <small className="field-error">{error}</small>}<button className="primary-action full" type="submit">Se connecter <span>→</span></button><small className="login-help">Comptes de développement: admin, snack Tadart, livreur.</small></form></main>;
}

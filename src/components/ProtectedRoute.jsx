import { useEffect } from "react";
import { normalizeRole } from "../auth";

export function AuthLoading() {
  return <main className="auth-loading"><span className="auth-spinner" /><strong>Vérification de votre session...</strong></main>;
}

export default function ProtectedRoute({ session, allowedRoles, children, redirectPath }) {
  const role = normalizeRole(session?.role);
  const allowed = role && allowedRoles.includes(role);
  useEffect(() => {
    if (!session || !allowed) window.history.replaceState({}, "", redirectPath);
  }, [allowed, redirectPath, session]);
  if (!session || !allowed) return <AuthLoading />;
  return children;
}

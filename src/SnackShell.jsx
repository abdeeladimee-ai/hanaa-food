import { useState } from "react";
import Login from "./pages/Login";
import DeliveryOrders from "./pages/DeliveryOrders";
import { getSession, homePathForRole, normalizeRole } from "./auth";

export default function SnackShell() {
  const [session, setSession] = useState(() => getSession());
  const role = normalizeRole(session?.role);

  if (role !== "SNACK") {
    return (
      <Login
        onSuccess={(nextSession) => {
          const nextRole = normalizeRole(nextSession?.role);
          const nextPath = homePathForRole(nextRole);

          if (nextRole !== "SNACK") {
            window.location.replace(nextPath);
            return;
          }

          window.history.replaceState({}, "", "/snack");
          setSession(nextSession);
        }}
      />
    );
  }

  return (
    <DeliveryOrders
      role="snack"
      session={session}
      onHome={() => window.location.assign("/")}
    />
  );
}

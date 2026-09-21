import { lazy, Suspense } from "react";

const RoleWorkflow = lazy(() => import("../RoleWorkflow"));

export default function PickupOrders({ onHome, role = "admin", session }) {
  return (
    <Suspense fallback={<main className="simple-page narrow">Chargement...</main>}>
      <RoleWorkflow
        role={role}
        session={session}
        orderType="pickup"
        title="Commandes À emporter"
        onHome={onHome}
      />
    </Suspense>
  );
}

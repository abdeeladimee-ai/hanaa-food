import { lazy, Suspense } from "react";

const RoleWorkflow = lazy(() => import("../RoleWorkflow"));

export default function DeliveryOrders({ onHome, role = "admin", session }) {
  return (
    <Suspense fallback={<main className="simple-page narrow">Chargement...</main>}>
      <RoleWorkflow
        role={role}
        session={session}
        orderType="delivery"
        title="Commandes Livraison"
        onHome={onHome}
      />
    </Suspense>
  );
}

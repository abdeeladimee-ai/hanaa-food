import { lazy, Suspense } from "react";

const RoleWorkflow = lazy(() => import("../RoleWorkflow"));

export default function DriverDashboard({ onHome, session }) {
  return (
    <Suspense fallback={<main className="simple-page narrow">Chargement...</main>}>
      <RoleWorkflow
        role="driver"
        session={session}
        orderType="delivery"
        title="Livraisons"
        onHome={onHome}
      />
    </Suspense>
  );
}

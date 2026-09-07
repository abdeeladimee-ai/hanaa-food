import RoleWorkflow from "../RoleWorkflow";

export default function DeliveryOrders({ onHome, role = "admin", session }) {
  return <RoleWorkflow role={role} session={session} orderType="delivery" title="Commandes Livraison" onHome={onHome} />;
}

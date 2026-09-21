import RoleWorkflow from "../RoleWorkflow";

export default function PickupOrders({ onHome, role = "admin", session }) {
  return <RoleWorkflow role={role} session={session} orderType="pickup" title="Commandes À emporter" onHome={onHome} />;
}

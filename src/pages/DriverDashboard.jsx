import RoleWorkflow from "../RoleWorkflow";

export default function DriverDashboard({ onHome, session }) {
  return <RoleWorkflow role="driver" session={session} orderType="delivery" title="Livraisons" onHome={onHome} />;
}

import AdminNavigation from "../components/AdminNavigation";

const drivers = ["Livreur 1", "Livreur 2"];
const users = [["Admin principal", "ADMIN"], ["Hanaa Food Tadart", "SNACK / BRANCH STAFF"], ["Hanaa Food Amgala", "SNACK / BRANCH STAFF"], ["Hanaa Food Rue Baghdad", "SNACK / BRANCH STAFF"], ...drivers.map((driver) => [driver, "DELIVERY DRIVER"])];

export default function AdminDirectory({ type, onNavigate, onHome }) {
  const isDrivers = type === "drivers";
  const entries = isDrivers ? drivers.map((name) => [name, "DELIVERY DRIVER"]) : users;
  return <main className="admin-dashboard"><header className="admin-dashboard-header"><div><button className="back-link" onClick={onHome}>← Hanaa Food</button><h1>{isDrivers ? "Livreurs" : "Utilisateurs"}</h1><p>{isDrivers ? "Comptes autorisés à prendre les livraisons." : "Rôles et accès de l'équipe."}</p></div><span className="workflow-role">ADMIN</span></header><AdminNavigation onNavigate={onNavigate} /><section className="workflow-roles admin-directory-list">{entries.map(([name, role]) => <div key={name}><span>{name}</span><b>{role}</b></div>)}</section></main>;
}

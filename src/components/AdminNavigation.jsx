export default function AdminNavigation({ role = "admin", onNavigate }) {
  const items = [
    ["Dashboard", "/admin"],
    ["Livraison", "/admin/commandes-livraison"],
    ["À emporter", "/admin/commandes-emporter"],
    ["Livreurs", "/admin/livreurs"],
    ["Utilisateurs", "/admin/utilisateurs"],
  ];
  const visible = role === "admin"
    ? items
    : [["Livraison", "/snack"]];
  return <nav className="admin-navigation">{visible.map(([label, path]) => <button key={path} onClick={() => onNavigate(path)}>{label}</button>)}</nav>;
}

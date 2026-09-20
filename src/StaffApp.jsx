import { lazy, Suspense, useEffect, useState } from "react";
import "./App.css";
import { authorizedPath, getSession, homePathForRole } from "./auth";

const Login = lazy(() => import("./pages/Login"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const DeliveryOrders = lazy(() => import("./pages/DeliveryOrders"));
const PickupOrders = lazy(() => import("./pages/PickupOrders"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const AdminDirectory = lazy(() => import("./pages/AdminDirectory"));

const routeViews = {
  "/login": "login",
  "/admin": "admin-dashboard",
  "/admin/commandes-livraison": "delivery-orders",
  "/admin/commandes-emporter": "pickup-orders",
  "/admin/livreurs": "driver-management",
  "/admin/utilisateurs": "user-management",
  "/snack": "snack-delivery",
  "/livreur": "driver",
};

function viewForPath(path) {
  return routeViews[path] || "login";
}

export default function StaffApp() {
  const [session, setSession] = useState(getSession);

  const [view, setView] = useState(() => {
    const safePath = authorizedPath(window.location.pathname, getSession());
    if (safePath !== window.location.pathname) {
      window.history.replaceState({}, "", safePath);
    }
    return viewForPath(safePath);
  });

  const navigate = (path, replace = false) => {
    if (!routeViews[path]) {
      window.location.href = path;
      return;
    }

    const safePath = authorizedPath(path, session);
    window.history[replace ? "replaceState" : "pushState"]({}, "", safePath);
    setView(viewForPath(safePath));
  };

  useEffect(() => {
    const syncPath = () => {
      const safePath = authorizedPath(window.location.pathname, session);

      if (!routeViews[safePath]) {
        window.location.href = safePath;
        return;
      }

      if (safePath !== window.location.pathname) {
        window.history.replaceState({}, "", safePath);
      }

      setView(viewForPath(safePath));
    };

    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, [session]);

  useEffect(() => {
    const safePath = authorizedPath(window.location.pathname, session);

    if (!routeViews[safePath]) {
      window.location.href = safePath;
      return;
    }

    if (safePath !== window.location.pathname) {
      window.history.replaceState({}, "", safePath);
      queueMicrotask(() => setView(viewForPath(safePath)));
    }
  }, [session]);

  return (
    <div className="app">
      <Suspense
        fallback={
          <div style={{ padding: 24, textAlign: "center", fontWeight: 700 }}>
            Chargement...
          </div>
        }
      >
        {view === "login" && (
          <Login
            onSuccess={(nextSession) => {
              const path = homePathForRole(nextSession.role);
              setSession(nextSession);
              window.history.replaceState({}, "", path);
              setView(viewForPath(path));
            }}
          />
        )}

        {view === "admin-dashboard" && (
          <AdminDashboard
            onNavigate={navigate}
            onHome={() => navigate("/")}
          />
        )}

        {view === "delivery-orders" && (
          <DeliveryOrders
            role="admin"
            session={session}
            onHome={() => navigate("/admin")}
          />
        )}

        {view === "pickup-orders" && (
          <PickupOrders
            role="admin"
            session={session}
            onHome={() => navigate("/admin")}
          />
        )}

        {view === "driver" && (
          <DriverDashboard
            session={session}
            onHome={() => navigate("/")}
          />
        )}

        {view === "driver-management" && (
          <AdminDirectory
            type="drivers"
            onNavigate={navigate}
            onHome={() => navigate("/admin")}
          />
        )}

        {view === "user-management" && (
          <AdminDirectory
            type="users"
            onNavigate={navigate}
            onHome={() => navigate("/admin")}
          />
        )}

        {view === "snack-delivery" && (
          <DeliveryOrders
            role="snack"
            session={session}
            onHome={() => navigate("/")}
          />
        )}
      </Suspense>
    </div>
  );
}

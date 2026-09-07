const sessionKey = "hanaa-auth-session";

const devAccounts = [
  {
    id: "admin-dev",
    email: "admin@hanaa-food.test",
    password: "admin123",
    role: "ADMIN",
    name: "Admin Hanaa Food",
  },

  {
    id: "snack-tadart-dev",
    email: "snack@hanaa-food.test",
    password: "snack123",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    name: "Caisse Tadart",
  },

  {
    id: "snack-amgala-dev",
    email: "amgala@hanaa-food.test",
    password: "amgala123",
    role: "SNACK",
    branchId: "amgala",
    branchName: "Hanaa Food Amgala",
    name: "Caisse Amgala",
  },

  {
    id: "snack-rue-baghdad-dev",
    email: "baghdad@hanaa-food.test",
    password: "baghdad123",
    role: "SNACK",
    branchId: "rue-baghdad",
    branchName: "Hanaa Food Rue Baghdad",
    name: "Caisse Rue Baghdad",
  },

  {
    id: "driver-dev",
    email: "livreur@hanaa-food.test",
    password: "driver123",
    role: "LIVREUR",
    name: "Livreur 1",
  },
];

export const normalizeRole = (role) => {
  const value = String(role || "").toUpperCase();

  if (["ADMIN", "ADMINISTRATOR"].includes(value)) {
    return "ADMIN";
  }

  if (["SNACK", "CASHIER", "STAFF", "BRANCH_STAFF"].includes(value)) {
    return "SNACK";
  }

  if (["LIVREUR", "DRIVER", "DELIVERY_DRIVER"].includes(value)) {
    return "LIVREUR";
  }

  return null;
};

export const homePathForRole = (role) =>
  ({
    ADMIN: "/admin",
    SNACK: "/snack",
    LIVREUR: "/livreur",
  })[normalizeRole(role)] || "/login";

export const allowedRolesForPath = (path) => {
  if (path === "/snack") return ["SNACK"];
  if (path === "/livreur") return ["LIVREUR"];

  if (path === "/admin" || path.startsWith("/admin/")) {
    return ["ADMIN"];
  }

  return null;
};

export const authorizedPath = (path, session) => {
  const allowedRoles = allowedRolesForPath(path);

  if (!allowedRoles) return path;

  const role = normalizeRole(session?.role);

  return role && allowedRoles.includes(role)
    ? path
    : homePathForRole(role);
};

export const getSession = () => {
  try {
    const session = JSON.parse(
      sessionStorage.getItem(sessionKey) || "null"
    );

    return session?.role && normalizeRole(session.role)
      ? {
          ...session,
          role: normalizeRole(session.role),
        }
      : null;
  } catch {
    return null;
  }
};

export const signIn = (email, password) => {
  const account = devAccounts.find(
    (item) =>
      item.email === email.trim().toLowerCase() &&
      item.password === password
  );

  if (!account) return null;

  const session = {
    ...account,
    authenticatedAt: new Date().toISOString(),
  };

  sessionStorage.setItem(
    sessionKey,
    JSON.stringify(session)
  );

  return session;
};

export const signOut = () => {
  sessionStorage.removeItem(sessionKey);
};

export const testAccounts = devAccounts.map(
  ({ password, ...account }) => ({
    ...account,
    password,
  })
);
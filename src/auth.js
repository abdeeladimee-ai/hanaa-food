const sessionKey = "hanaa-auth-session";
const staffKey = "hanaa-staff-accounts";

const branchNames = {
  tadart: "Hanaa Food Tadart",
  amgala: "Hanaa Food Amgala",
  "rue-baghdad": "Hanaa Food Rue Baghdad",
};

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

const normalizePhone = (value) =>
  String(value || "").replace(/[^\d+]/g, "").trim();

export const normalizeRole = (role) => {
  const value = String(role || "").toUpperCase();

  if (["ADMIN", "ADMINISTRATOR"].includes(value)) return "ADMIN";

  if (
    ["SNACK", "CASHIER", "STAFF", "BRANCH_STAFF"].includes(value)
  ) {
    return "SNACK";
  }

  if (
    ["LIVREUR", "DRIVER", "DELIVERY_DRIVER"].includes(value)
  ) {
    return "LIVREUR";
  }

  return null;
};

export const getStaffAccounts = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(staffKey) || "[]"
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const saveStaffAccounts = (accounts) => {
  localStorage.setItem(
    staffKey,
    JSON.stringify(accounts)
  );

  window.dispatchEvent(
    new Event("hanaa-staff-updated")
  );
};

export const addStaffAccount = ({
  name,
  phone,
  password,
  role,
  branchId = "",
}) => {
  const cleanName = String(name || "").trim();
  const cleanPhone = normalizePhone(phone);
  const cleanPassword = String(password || "");
  const cleanRole = normalizeRole(role);

  if (
    !cleanName ||
    !cleanPhone ||
    cleanPassword.length < 4 ||
    !cleanRole
  ) {
    return {
      ok: false,
      error:
        "Kammel smiya, téléphone, rôle w mot de passe.",
    };
  }

  if (
    cleanRole === "SNACK" &&
    !branchNames[branchId]
  ) {
    return {
      ok: false,
      error: "Khtar branche dyal caissier.",
    };
  }

  const current = getStaffAccounts();

  const exists = current.some(
    (item) =>
      normalizePhone(item.phone) === cleanPhone
  );

  if (exists) {
    return {
      ok: false,
      error: "Had numéro deja kayn.",
    };
  }

  const prefix =
    cleanRole === "LIVREUR"
      ? "driver"
      : "snack";

  const account = {
    id: `${prefix}-${Date.now()}`,
    phone: cleanPhone,
    password: cleanPassword,
    role: cleanRole,
    name: cleanName,
    active: true,
    createdAt: new Date().toISOString(),

    ...(cleanRole === "SNACK"
      ? {
          branchId,
          branchName:
            branchNames[branchId],
        }
      : {}),
  };

  saveStaffAccounts([
    account,
    ...current,
  ]);

  return {
    ok: true,
    account,
  };
};

export const deleteStaffAccount = (id) => {
  const next = getStaffAccounts().filter(
    (item) => item.id !== id
  );

  saveStaffAccounts(next);
};

export const toggleStaffAccount = (id) => {
  const next = getStaffAccounts().map(
    (item) =>
      item.id === id
        ? {
            ...item,
            active:
              item.active === false,
          }
        : item
  );

  saveStaffAccounts(next);
};

export const homePathForRole = (role) =>
  ({
    ADMIN: "/admin",
    SNACK: "/snack",
    LIVREUR: "/livreur",
  })[normalizeRole(role)] || "/login";

export const allowedRolesForPath = (
  path
) => {
  if (path === "/snack") {
    return ["SNACK"];
  }

  if (path === "/livreur") {
    return ["LIVREUR"];
  }

  if (
    path === "/admin" ||
    path.startsWith("/admin/")
  ) {
    return ["ADMIN"];
  }

  return null;
};

export const authorizedPath = (
  path,
  session
) => {
  const allowedRoles =
    allowedRolesForPath(path);

  if (!allowedRoles) {
    return path;
  }

  const role = normalizeRole(
    session?.role
  );

  return role &&
    allowedRoles.includes(role)
    ? path
    : homePathForRole(role);
};

export const getSession = () => {
  try {
    const persistent = localStorage.getItem(sessionKey);
    const temporary = sessionStorage.getItem(sessionKey);
    const rawSession = persistent || temporary || "null";
    const session = JSON.parse(rawSession);

    if (!session?.role) {
      return null;
    }

    const role = normalizeRole(
      session.role
    );

    if (!role) {
      return null;
    }

    const normalizedSession = {
      ...session,
      role,
    };

    if (!persistent) {
      localStorage.setItem(
        sessionKey,
        JSON.stringify(normalizedSession)
      );
    }

    return normalizedSession;
  } catch {
    return null;
  }
};

export const signIn = (
  identifier,
  password
) => {
  const value = String(
    identifier || ""
  ).trim();

  const lowerValue =
    value.toLowerCase();

  const phoneValue =
    normalizePhone(value);

  const accounts = [
    ...devAccounts,
    ...getStaffAccounts(),
  ];

  const account = accounts.find(
    (item) => {
      if (item.active === false) {
        return false;
      }

      const sameEmail =
        item.email &&
        String(item.email)
          .toLowerCase() ===
          lowerValue;

      const samePhone =
        item.phone &&
        normalizePhone(
          item.phone
        ) === phoneValue;

      return (
        (sameEmail || samePhone) &&
        item.password === password
      );
    }
  );

  if (!account) {
    return null;
  }

  const session = {
    ...account,
    role: normalizeRole(
      account.role
    ),
    authenticatedAt:
      new Date().toISOString(),
  };

  localStorage.setItem(
    sessionKey,
    JSON.stringify(session)
  );
  sessionStorage.removeItem(sessionKey);

  return session;
};

export const signOut = () => {
  localStorage.removeItem(
    sessionKey
  );
  sessionStorage.removeItem(
    sessionKey
  );
};

export const testAccounts =
  devAccounts.map(
    ({ password, ...account }) => ({
      ...account,
      password,
    })
  );
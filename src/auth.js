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
    passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
    role: "ADMIN",
    name: "Admin Hanaa Food",
  },
  {
    id: "snack-tadart-dev",
    email: "snack@hanaa-food.test",
    passwordHash: "00e38a2374c9eb01d3e7f763a549028a07fcaea6478e3f01f899364baa40c96b",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    name: "Caisse Tadart",
  },
  {
    id: "snack-jnan-tadart",
    phone: "0630012136",
    passwordHash: "d150f3db3cdbaa934c701b9b98dfdeace78542ecff20ce3713abbd5bd4920d04",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    name: "Caisse Jnan Tadart",
    active: true,
  },
  {
    id: "snack-amgala-dev",
    email: "amgala@hanaa-food.test",
    passwordHash: "36758f157740a12393c885a7fa45ce0957447cb1ca836f5e6b25bf656046f420",
    role: "SNACK",
    branchId: "amgala",
    branchName: "Hanaa Food Amgala",
    name: "Caisse Amgala",
  },
  {
    id: "snack-rue-baghdad-dev",
    email: "baghdad@hanaa-food.test",
    passwordHash: "f80640ac2bbd19fc684156554cf440be40785417123617554356bca7a9688055",
    role: "SNACK",
    branchId: "rue-baghdad",
    branchName: "Hanaa Food Rue Baghdad",
    name: "Hajar",
  },
  {
    id: "driver-dev",
    email: "livreur@hanaa-food.test",
    passwordHash: "494d022492052a06f8f81949639a1d148c1051fa3d4e4688fbd96efe649cd382",
    role: "LIVREUR",
    name: "Livreur 1",
  },
  {
    id: "driver-youssef",
    passwordHash: "55f2db1fdb76dccce775f0707d4fa841541bb99d1395f67eec95296ba63b1f0d",
    role: "LIVREUR",
    name: "Youssef",
    active: true,
  },
];

const normalizePhone = (value) =>
  String(value || "").replace(/[^\d+]/g, "").trim();

const hashPassword = async (value) => {
  const input = new TextEncoder().encode(String(value || ""));
  const digest = await window.crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const normalizeRole = (role) => {
  const value = String(role || "").toUpperCase();

  if (["ADMIN", "ADMINISTRATOR"].includes(value)) return "ADMIN";

  if (["SNACK", "CASHIER", "STAFF", "BRANCH_STAFF"].includes(value)) {
    return "SNACK";
  }

  if (["LIVREUR", "DRIVER", "DELIVERY_DRIVER"].includes(value)) {
    return "LIVREUR";
  }

  return null;
};

export const getStaffAccounts = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(staffKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const saveStaffAccounts = (accounts) => {
  localStorage.setItem(staffKey, JSON.stringify(accounts));
  window.dispatchEvent(new Event("hanaa-staff-updated"));
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

  if (!cleanName || !cleanPhone || cleanPassword.length < 4 || !cleanRole) {
    return {
      ok: false,
      error: "Kammel smiya, téléphone, rôle w mot de passe.",
    };
  }

  if (cleanRole === "SNACK" && !branchNames[branchId]) {
    return {
      ok: false,
      error: "Khtar branche dyal caissier.",
    };
  }

  const current = getStaffAccounts();
  const exists = current.some(
    (item) => normalizePhone(item.phone) === cleanPhone,
  );

  if (exists) {
    return {
      ok: false,
      error: "Had numéro deja kayn.",
    };
  }

  const prefix = cleanRole === "LIVREUR" ? "driver" : "snack";

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
          branchName: branchNames[branchId],
        }
      : {}),
  };

  saveStaffAccounts([account, ...current]);

  return {
    ok: true,
    account,
  };
};

export const deleteStaffAccount = (id) => {
  const next = getStaffAccounts().filter((item) => item.id !== id);
  saveStaffAccounts(next);
};

export const toggleStaffAccount = (id) => {
  const next = getStaffAccounts().map((item) =>
    item.id === id
      ? {
          ...item,
          active: item.active === false,
        }
      : item,
  );

  saveStaffAccounts(next);
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
    const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");

    if (!session?.role) return null;

    const role = normalizeRole(session.role);
    if (!role) return null;

    return {
      ...session,
      role,
    };
  } catch {
    return null;
  }
};

export const signIn = async (identifier, password) => {
  const value = String(identifier || "").trim();
  const lowerValue = value.toLowerCase();
  const phoneValue = normalizePhone(value);
  const enteredHash = await hashPassword(password);

  const accounts = [...devAccounts, ...getStaffAccounts()];
  let account = null;

  for (const item of accounts) {
    if (item.active === false) continue;

    const sameEmail =
      item.email && String(item.email).toLowerCase() === lowerValue;
    const samePhone =
      item.phone && normalizePhone(item.phone) === phoneValue;
    const sameName =
      item.name && String(item.name).trim().toLowerCase() === lowerValue;

    if (!sameEmail && !samePhone && !sameName) continue;

    const passwordMatches = item.passwordHash
      ? item.passwordHash === enteredHash
      : item.password === password;

    if (passwordMatches) {
      account = item;
      break;
    }
  }

  if (!account) return null;

  const { password: _password, passwordHash: _passwordHash, ...safeAccount } = account;
  const session = {
    ...safeAccount,
    role: normalizeRole(account.role),
    authenticatedAt: new Date().toISOString(),
  };

  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
};

export const signOut = () => {
  sessionStorage.removeItem(sessionKey);
};

export const testAccounts = devAccounts.map(
  ({ passwordHash: _passwordHash, ...account }) => account,
);
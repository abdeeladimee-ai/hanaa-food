import { requireSupabase } from "./supabase";

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
    passwordHash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
    role: "ADMIN",
    name: "admin",
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

const readRawSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
};

const getCloudToken = () => String(readRawSession()?.cloudToken || "");

const cloudRpc = async (name, args) => {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};

const migrateLegacyStaffAccounts = async (token) => {
  const legacy = getStaffAccounts().filter(
    (item) =>
      item?.password &&
      ["SNACK", "LIVREUR"].includes(normalizeRole(item.role)),
  );

  for (const item of legacy) {
    const role = normalizeRole(item.role);
    await cloudRpc("staff_admin_upsert", {
      p_token: token,
      p_name: String(item.name || "").trim(),
      p_phone: normalizePhone(item.phone),
      p_password: String(item.password || ""),
      p_role: role,
      p_branch_id: role === "SNACK" ? item.branchId || "tadart" : null,
      p_branch_name:
        role === "SNACK"
          ? item.branchName || branchNames[item.branchId] || branchNames.tadart
          : null,
    });
  }
};

const listCloudStaffAccounts = async (token) => {
  const data = await cloudRpc("staff_admin_list", { p_token: token });
  return Array.isArray(data) ? data : [];
};

export const refreshStaffAccounts = async () => {
  const token = getCloudToken();
  if (!token) return getStaffAccounts();

  await migrateLegacyStaffAccounts(token);
  const accounts = await listCloudStaffAccounts(token);
  saveStaffAccounts(accounts);
  return accounts;
};

export const addStaffAccount = async ({
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
      error: "Kammel smiya, telephone, role w mot de passe.",
    };
  }

  if (cleanRole === "SNACK" && !branchNames[branchId]) {
    return {
      ok: false,
      error: "Khtar branche dyal caissier.",
    };
  }

  const token = getCloudToken();
  if (!token) {
    return {
      ok: false,
      error: "3awed dkhol b compte admin bach t7fed lcompte online.",
    };
  }

  try {
    const account = await cloudRpc("staff_admin_upsert", {
      p_token: token,
      p_name: cleanName,
      p_phone: cleanPhone,
      p_password: cleanPassword,
      p_role: cleanRole,
      p_branch_id: cleanRole === "SNACK" ? branchId : null,
      p_branch_name:
        cleanRole === "SNACK" ? branchNames[branchId] : null,
    });

    const accounts = await listCloudStaffAccounts(token);
    saveStaffAccounts(accounts);

    return { ok: true, account };
  } catch (error) {
    console.error("Staff account save failed:", error);
    return {
      ok: false,
      error: "Ma t7fedch lcompte. 3awed dkhol admin w jarrab.",
    };
  }
};

export const deleteStaffAccount = async (id) => {
  const token = getCloudToken();
  if (!token) throw new Error("ADMIN_RELOGIN_REQUIRED");

  await cloudRpc("staff_admin_delete", {
    p_token: token,
    p_account_id: String(id),
  });

  const accounts = await listCloudStaffAccounts(token);
  saveStaffAccounts(accounts);
  return accounts;
};

export const toggleStaffAccount = async (id) => {
  const token = getCloudToken();
  if (!token) throw new Error("ADMIN_RELOGIN_REQUIRED");

  await cloudRpc("staff_admin_toggle", {
    p_token: token,
    p_account_id: String(id),
  });

  const accounts = await listCloudStaffAccounts(token);
  saveStaffAccounts(accounts);
  return accounts;
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

    if (role === "ADMIN" && !session.cloudToken) {
      sessionStorage.removeItem(sessionKey);
      return null;
    }

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

  try {
    const cloudAccount = await cloudRpc("staff_login", {
      p_identifier: value,
      p_password: String(password || ""),
    });

    if (cloudAccount?.role) {
      const session = {
        ...cloudAccount,
        role: normalizeRole(cloudAccount.role),
        authenticatedAt: new Date().toISOString(),
      };

      sessionStorage.setItem(sessionKey, JSON.stringify(session));

      if (session.role === "ADMIN" && session.cloudToken) {
        try {
          await migrateLegacyStaffAccounts(session.cloudToken);
          const accounts = await listCloudStaffAccounts(session.cloudToken);
          saveStaffAccounts(accounts);
        } catch (error) {
          console.error("Legacy staff sync failed:", error);
        }
      }

      return session;
    }
  } catch (error) {
    console.error("Cloud staff login failed:", error);
  }

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

  if (!account || normalizeRole(account.role) === "ADMIN") return null;

  const { password: _password, passwordHash: _passwordHash, ...safeAccount } =
    account;

  const session = {
    ...safeAccount,
    role: normalizeRole(account.role),
    authenticatedAt: new Date().toISOString(),
  };

  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
};

export const signOut = () => {
  const token = getCloudToken();

  if (token) {
    try {
      const supabase = requireSupabase();
      void supabase.rpc("staff_logout", { p_token: token });
    } catch {
      // Local logout must still work if Supabase is temporarily unavailable.
    }
  }

  sessionStorage.removeItem(sessionKey);
};

export const testAccounts = devAccounts.map(
  ({ passwordHash: _passwordHash, ...account }) => account,
);
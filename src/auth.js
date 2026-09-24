import { requireSupabase } from "./supabase";

const sessionKey = "hanaa-auth-session";
const staffKey = "hanaa-staff-accounts";

const branchNames = {
  tadart: "Hanaa Food Tadart",
  amgala: "Hanaa Food Amgala",
  "rue-baghdad": "Hanaa Food Rue Baghdad",
};


const normalizePhone = (value) => {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (/^212[67]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
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
    const persistent = localStorage.getItem(sessionKey);
    if (persistent) return JSON.parse(persistent);

    const legacy = sessionStorage.getItem(sessionKey);
    if (!legacy) return null;

    const parsed = JSON.parse(legacy);
    localStorage.setItem(sessionKey, legacy);
    sessionStorage.removeItem(sessionKey);
    return parsed;
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

const withTimeout = (promise, ms, code = "REQUEST_TIMEOUT") =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        const error = new Error(code);
        error.code = code;
        reject(error);
      }, ms);
    }),
  ]);

const staffApiAuth = async (action, payload = {}) => {
  const response = await fetch("/api/staff-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.code || "STAFF_API_AUTH_FAILED");
    error.code = data?.code || "STAFF_API_AUTH_FAILED";
    error.status = response.status;
    throw error;
  }
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
    const session = readRawSession();
    if (!session?.role) return null;

    const role = normalizeRole(session.role);
    if (!role || !session.staffApiToken) {
      localStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
      return null;
    }

    if (role === "ADMIN" && !session.cloudToken) {
      localStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
      return null;
    }

    return { ...session, role };
  } catch {
    return null;
  }
};

export const signIn = async (identifier, password) => {
  const value = String(identifier || "").trim();
  const enteredPassword = String(password || "");

  try {
    const cloudAccount = await withTimeout(
      cloudRpc("staff_login", {
        p_identifier: value,
        p_password: enteredPassword,
      }),
      6000,
      "STAFF_LOGIN_TIMEOUT",
    );

    if (!cloudAccount?.role || !cloudAccount?.cloudToken) return null;

    const verified = await withTimeout(
      staffApiAuth("exchangeCloud", { cloudToken: cloudAccount.cloudToken }),
      6000,
      "STAFF_TOKEN_TIMEOUT",
    );

    const session = {
      ...cloudAccount,
      ...(verified.account || {}),
      role: normalizeRole(verified.account?.role || cloudAccount.role),
      staffApiToken: verified.staffApiToken,
      authenticatedAt: new Date().toISOString(),
    };

    if (!session.role || !session.staffApiToken) return null;

    localStorage.setItem(sessionKey, JSON.stringify(session));

    if (session.role === "ADMIN" && session.cloudToken) {
      void (async () => {
        try {
          await migrateLegacyStaffAccounts(session.cloudToken);
          const accounts = await listCloudStaffAccounts(session.cloudToken);
          saveStaffAccounts(accounts);
        } catch (error) {
          console.error("Legacy staff sync failed:", error);
        }
      })();
    }

    return session;
  } catch (error) {
    console.error("Verified staff login failed:", error);
    return null;
  }
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

  localStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionKey);
};

export const testAccounts = [];

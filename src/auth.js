const sessionKey = "hanaa-auth-session";
const staffKey = "hanaa-staff-accounts";

const branchNames = {
  tadart: "Hanaa Food Tadart",
  amgala: "Hanaa Food Amgala",
  "rue-baghdad": "Hanaa Food Rue Baghdad",
};

export const normalizeRole = (role) => {
  const value = String(role || "").toUpperCase();
  if (["ADMIN", "ADMINISTRATOR"].includes(value)) return "ADMIN";
  if (["SNACK", "CASHIER", "STAFF", "BRANCH_STAFF"].includes(value)) return "SNACK";
  if (["LIVREUR", "DRIVER", "DELIVERY_DRIVER"].includes(value)) return "LIVREUR";
  return null;
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

const saveStaffAccounts = (accounts) => {
  localStorage.setItem(staffKey, JSON.stringify(accounts || []));
  window.dispatchEvent(new Event("hanaa-staff-updated"));
};

export const getStaffAccounts = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(staffKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const staffApi = async (action, payload = {}, token = "") => {
  const response = await fetch("/api/staff-auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.code || "STAFF_API_FAILED");
    error.code = data?.code || "STAFF_API_FAILED";
    error.status = response.status;
    throw error;
  }
  return data;
};

export const refreshStaffAccounts = async () => {
  const token = String(readRawSession()?.staffApiToken || "");
  if (!token) return getStaffAccounts();
  const data = await staffApi("list", {}, token);
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
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
  const token = String(readRawSession()?.staffApiToken || "");
  if (!token) return { ok: false, error: "3awed dkhol b compte admin." };

  try {
    const normalizedRole = normalizeRole(role);
    const data = await staffApi(
      "upsert",
      {
        name: String(name || "").trim(),
        phone: String(phone || "").trim(),
        password: String(password || ""),
        role: normalizedRole,
        branchId: normalizedRole === "SNACK" ? branchId : null,
        branchName:
          normalizedRole === "SNACK" ? branchNames[branchId] || "" : null,
      },
      token,
    );

    await refreshStaffAccounts();
    return { ok: true, account: data.account };
  } catch (error) {
    console.error("Staff account save failed:", error);
    return {
      ok: false,
      error:
        error?.code === "INVALID_STAFF_ACCOUNT"
          ? "T2akked mn smiya, téléphone w password (6 7orouf/ar9am minimum)."
          : "Ma t7fedch lcompte. 3awed jarrab.",
    };
  }
};

export const deleteStaffAccount = async (id) => {
  const token = String(readRawSession()?.staffApiToken || "");
  if (!token) throw new Error("ADMIN_RELOGIN_REQUIRED");
  await staffApi("delete", { id: String(id || "") }, token);
  return refreshStaffAccounts();
};

export const toggleStaffAccount = async (id) => {
  const token = String(readRawSession()?.staffApiToken || "");
  if (!token) throw new Error("ADMIN_RELOGIN_REQUIRED");
  await staffApi("toggle", { id: String(id || "") }, token);
  return refreshStaffAccounts();
};

export const homePathForRole = (role) =>
  ({ ADMIN: "/admin", SNACK: "/snack", LIVREUR: "/livreur" })[
    normalizeRole(role)
  ] || "/login";

export const allowedRolesForPath = (path) => {
  if (path === "/snack") return ["SNACK"];
  if (path === "/livreur") return ["LIVREUR"];
  if (path === "/admin" || path.startsWith("/admin/")) return ["ADMIN"];
  return null;
};

export const authorizedPath = (path, session) => {
  const allowedRoles = allowedRolesForPath(path);
  if (!allowedRoles) return path;
  const role = normalizeRole(session?.role);
  return role && allowedRoles.includes(role) ? path : homePathForRole(role);
};

export const getSession = () => {
  try {
    const session = readRawSession();
    if (!session?.role || !session?.staffApiToken) return null;
    const role = normalizeRole(session.role);
    return role ? { ...session, role } : null;
  } catch {
    return null;
  }
};

export const signIn = async (identifier, password) => {
  try {
    const data = await staffApi("login", {
      identifier: String(identifier || "").trim(),
      password: String(password || ""),
    });

    const account = data.account;
    if (!account?.role || !data.staffApiToken) return null;

    const session = {
      ...account,
      role: normalizeRole(account.role),
      staffApiToken: data.staffApiToken,
      authenticatedAt: new Date().toISOString(),
    };

    localStorage.setItem(sessionKey, JSON.stringify(session));
    return session;
  } catch (error) {
    console.error("Staff login failed:", error);
    return null;
  }
};

export const signOut = () => {
  localStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionKey);
};

export const testAccounts = [];

import crypto from "node:crypto";
import { issueStaffToken } from "../lib/staffAuth.js";
import { supabaseUrl, supabaseAnonKey } from "../src/supabase.js";

const legacyAccounts = [
  {
    id: "cashier-baghdad-hajar",
    name: "Hajar",
    username: "hajarhanaa",
    role: "SNACK",
    branchId: "rue-baghdad",
    branchName: "Hanaa Food Rue Baghdad",
    passwordHash: "79c87c9405ac26eb79b16dba42d79b24ebb592ad179207e33e7b1bd9efa70807",
  },
  {
    id: "cashier-baghdad-mohamed",
    name: "Mohamed",
    username: "mohamedhanaa",
    role: "SNACK",
    branchId: "rue-baghdad",
    branchName: "Hanaa Food Rue Baghdad",
    passwordHash: "b2231142a60afb6d6a4671e5193d473632595608212862ae5e15e31b0eec1623",
  },
  {
    id: "cashier-tadart-aya",
    name: "Aya",
    username: "ayahanaa",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    passwordHash: "6b4e59de8a6e7508abda84cbda834f3e2ce8b8a5587d311ec81715c69a30a1d1",
  },
  {
    id: "cashier-tadart-najwa",
    name: "Najwa",
    username: "najwahanaa",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    passwordHash: "d150f3db3cdbaa934c701b9b98dfdeace78542ecff20ce3713abbd5bd4920d04",
  },
  {
    id: "cashier-amgala-abdou",
    name: "Abdou",
    username: "abdouhanaa",
    role: "SNACK",
    branchId: "amgala",
    branchName: "Hanaa Food Amgala",
    passwordHash: "148e4eee57497681080718dc37a591eb38c43a1d02b4a0c4b052fc45a98a009e",
  },
  {
    id: "cashier-amgala-taha",
    name: "Taha",
    username: "tahahanaa",
    role: "SNACK",
    branchId: "amgala",
    branchName: "Hanaa Food Amgala",
    passwordHash: "30f4489530b10178437e7a1f1ec8f6d5f1039526a0f10a8dc84443be91b6f564",
  },
  {
    id: "snack-tadart-dev",
    name: "Caisse Tadart",
    email: "snack@hanaa-food.test",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    passwordHash: "00e38a2374c9eb01d3e7f763a549028a07fcaea6478e3f01f899364baa40c96b",
  },
  {
    id: "snack-jnan-tadart",
    name: "Caisse Jnan Tadart",
    phone: "0630012136",
    role: "SNACK",
    branchId: "tadart",
    branchName: "Hanaa Food Tadart",
    passwordHash: "d150f3db3cdbaa934c701b9b98dfdeace78542ecff20ce3713abbd5bd4920d04",
  },
  {
    id: "snack-amgala-dev",
    name: "Caisse Amgala",
    email: "amgala@hanaa-food.test",
    role: "SNACK",
    branchId: "amgala",
    branchName: "Hanaa Food Amgala",
    passwordHash: "36758f157740a12393c885a7fa45ce0957447cb1ca836f5e6b25bf656046f420",
  },
  {
    id: "snack-rue-baghdad-dev",
    name: "Hajar",
    email: "baghdad@hanaa-food.test",
    role: "SNACK",
    branchId: "rue-baghdad",
    branchName: "Hanaa Food Rue Baghdad",
    passwordHash: "f80640ac2bbd19fc684156554cf440be40785417123617554356bca7a9688055",
  },
  {
    id: "driver-dev",
    name: "Livreur 1",
    email: "livreur@hanaa-food.test",
    role: "LIVREUR",
    branchId: null,
    branchName: null,
    passwordHash: "494d022492052a06f8f81949639a1d148c1051fa3d4e4688fbd96efe649cd382",
  },
];

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "").trim();
  if (/^212[67]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}

function passwordHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeAccount(account) {
  return {
    id: account.id,
    email: account.email || undefined,
    phone: account.phone || undefined,
    name: account.name,
    role: String(account.role || "").toUpperCase(),
    branchId: account.branch_id || account.branchId || undefined,
    branchName: account.branch_name || account.branchName || undefined,
    active: account.active !== false,
  };
}

function sameHash(left, right) {
  try {
    const a = Buffer.from(String(left || ""), "hex");
    const b = Buffer.from(String(right || ""), "hex");
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function legacyLogin(identifier, password) {
  const raw = String(identifier || "").trim();
  const lower = raw.toLowerCase();
  const phone = normalizePhone(raw);
  const enteredHash = passwordHash(password);

  const account = legacyAccounts.find((item) => {
    const match =
      (item.email && item.email.toLowerCase() === lower) ||
      (item.username && item.username.toLowerCase() === lower) ||
      (item.name && item.name.toLowerCase() === lower) ||
      (item.phone && normalizePhone(item.phone) === phone);

    return match && sameHash(item.passwordHash, enteredHash);
  });

  return account ? safeAccount(account) : null;
}

async function validateCloudToken(token) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/staff_session_validate`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: String(token || "") }),
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => []);
  const account = Array.isArray(data) ? data[0] : null;
  if (!account?.role || account.active === false) return null;
  return safeAccount(account);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const body = bodyOf(req);
    const action = String(body.action || "");

    let account = null;
    if (action === "exchangeCloud") {
      account = await validateCloudToken(body.cloudToken);
    } else if (action === "legacyLogin") {
      account = legacyLogin(body.identifier, body.password);
    } else {
      return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
    }

    if (!account) {
      return res.status(401).json({ ok: false, code: "INVALID_STAFF_CREDENTIALS" });
    }

    return res.status(200).json({
      ok: true,
      account,
      staffApiToken: issueStaffToken(account),
    });
  } catch (error) {
    console.error("staff auth failed", error);
    return res.status(500).json({ ok: false, code: "STAFF_AUTH_FAILED" });
  }
}

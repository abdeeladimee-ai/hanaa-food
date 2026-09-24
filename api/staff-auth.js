import { issueStaffToken } from "../lib/staffAuth.js";
import { supabaseUrl, supabaseAnonKey } from "../src/supabase.js";

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
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
    if (String(body.action || "") !== "exchangeCloud") {
      return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
    }

    const account = await validateCloudToken(body.cloudToken);
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

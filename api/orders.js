const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", JSON_HEADERS["Content-Type"]);
  res.end(JSON.stringify(body));
}

function firstForwardedIp(req) {
  const raw =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "";
  return String(Array.isArray(raw) ? raw[0] : raw)
    .split(",")[0]
    .trim();
}

function validOrder(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (!/^HF\d{4}$/i.test(String(row.id || ""))) return false;
  if (!["delivery", "pickup"].includes(String(row.order_type || ""))) return false;
  if (!String(row.customer_phone || "").trim()) return false;
  if (!String(row.branch_id || "").trim()) return false;
  return true;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      configured: Boolean(
        process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY,
      ),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const row = req.body;
  if (!validOrder(row)) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || "");

  if (!supabaseUrl || !anonKey) {
    return send(res, 500, {
      ok: false,
      code: "SERVER_SUPABASE_NOT_CONFIGURED",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const clientIp = firstForwardedIp(req);
    const response = await fetch(
      `${supabaseUrl}/rest/v1/orders?on_conflict=id`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
          Origin: "https://hanaafood.ma",
          "User-Agent": "Mozilla/5.0 HanaaFoodOrderProxy/1.0",
          ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
        },
        body: JSON.stringify(row),
        signal: controller.signal,
      },
    );

    if (response.ok || response.status === 409) {
      return send(res, 200, { ok: true });
    }

    const raw = await response.text();
    let upstream = null;
    try {
      upstream = raw ? JSON.parse(raw) : null;
    } catch {
      upstream = raw ? raw.slice(0, 500) : null;
    }

    return send(res, response.status, {
      ok: false,
      code: "SUPABASE_ORDER_FAILED",
      status: response.status,
      upstream,
    });
  } catch (error) {
    const timeout = error?.name === "AbortError";
    return send(res, timeout ? 504 : 502, {
      ok: false,
      code: timeout ? "SUPABASE_TIMEOUT" : "SUPABASE_NETWORK_ERROR",
      message: String(error?.message || error || ""),
    });
  } finally {
    clearTimeout(timer);
  }
}

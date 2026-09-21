const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", JSON_HEADERS["Content-Type"]);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function validOrder(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (!/^HF\d{4}$/i.test(String(row.id || ""))) return false;
  if (!["delivery", "pickup"].includes(String(row.order_type || ""))) return false;
  if (!String(row.customer_phone || "").trim()) return false;
  if (!String(row.branch_id || "").trim()) return false;
  return true;
}

const supabaseUrl = "https://kkmbiiiglgevwehhmtzq.supabase.co";
const publishableKey = "sb_publishable_cqSPEkE8JbyIu9NasnOMng_GwRMKVFO";

async function supabaseFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    return await fetch(`${supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const response = await supabaseFetch("/rest/v1/orders?select=id&limit=1", {
        method: "GET",
      });

      if (!response.ok) {
        return send(res, response.status, {
          ok: false,
          code: "SUPABASE_REST_UNAVAILABLE",
        });
      }

      return send(res, 200, { ok: true, path: "supabase-rest" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
    }

    const row = req.body;
    if (!validOrder(row)) {
      return send(res, 400, { ok: false, code: "INVALID_ORDER" });
    }

    const response = await supabaseFetch("/rest/v1/orders?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        detail = "";
      }

      return send(res, response.status, {
        ok: false,
        code: "SUPABASE_ORDER_WRITE_FAILED",
        detail,
      });
    }

    return send(res, 200, { ok: true, path: "supabase-rest" });
  } catch (error) {
    return send(res, error?.name === "AbortError" ? 504 : 502, {
      ok: false,
      code:
        error?.name === "AbortError"
          ? "SUPABASE_REST_TIMEOUT"
          : "SUPABASE_REST_NETWORK_ERROR",
    });
  }
}

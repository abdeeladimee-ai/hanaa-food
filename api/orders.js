const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", JSON_HEADERS["Content-Type"]);
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

async function callDirectWriter({ supabaseUrl, anonKey, method, row }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/order-write-direct`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-hanaa-key": anonKey,
        },
        ...(method === "POST" ? { body: JSON.stringify(row) } : {}),
        signal: controller.signal,
      },
    );

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const supabaseUrl = "https://kkmbiiiglgevwehhmtzq.supabase.co";
  const anonKey = "sb_publishable_cqSPEkE8JbyIu9NasnOMng_GwRMKVFO";

  if (!supabaseUrl || !anonKey) {
    return send(res, 500, {
      ok: false,
      code: "SERVER_SUPABASE_NOT_CONFIGURED",
    });
  }

  if (req.method === "GET") {
    try {
      const { response, body } = await callDirectWriter({
        supabaseUrl,
        anonKey,
        method: "GET",
      });

      return send(res, response.status, body || {
        ok: response.ok,
        code: response.ok ? "OK" : "DIRECT_WRITER_FAILED",
      });
    } catch (error) {
      return send(res, error?.name === "AbortError" ? 504 : 502, {
        ok: false,
        code: error?.name === "AbortError" ? "DIRECT_WRITER_TIMEOUT" : "DIRECT_WRITER_NETWORK_ERROR",
      });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const row = req.body;
  if (!validOrder(row)) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  try {
    const { response, body } = await callDirectWriter({
      supabaseUrl,
      anonKey,
      method: "POST",
      row,
    });

    if (response.ok) {
      return send(res, 200, {
        ok: true,
        path: body?.path || "supabase-direct-writer",
      });
    }

    return send(res, response.status, body || {
      ok: false,
      code: "DIRECT_WRITER_FAILED",
    });
  } catch (error) {
    return send(res, error?.name === "AbortError" ? 504 : 502, {
      ok: false,
      code: error?.name === "AbortError" ? "DIRECT_WRITER_TIMEOUT" : "DIRECT_WRITER_NETWORK_ERROR",
      message: String(error?.message || error || ""),
    });
  }
}

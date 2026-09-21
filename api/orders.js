const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const CLIENT_VERSION = "hanaa-orders-v2";
const SUPABASE_URL = "https://kkmbiiiglgevwehhmtzq.supabase.co";
const SUPABASE_KEY = "sb_publishable_cqSPEkE8JbyIu9NasnOMng_GwRMKVFO";

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", JSON_HEADERS["Content-Type"]);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function validOrder(row) {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      /^HF\d{4}$/i.test(String(row.id || "")) &&
      ["delivery", "pickup"].includes(String(row.order_type || "")) &&
      String(row.customer_phone || "").trim() &&
      String(row.branch_id || "").trim(),
  );
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?select=id&limit=1`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          signal: controller.signal,
        },
      );
      return send(res, response.ok ? 200 : response.status, {
        ok: response.ok,
        code: response.ok ? "OK" : "SUPABASE_HEALTH_FAILED",
      });
    } catch (error) {
      return send(res, error?.name === "AbortError" ? 504 : 502, {
        ok: false,
        code:
          error?.name === "AbortError"
            ? "SUPABASE_HEALTH_TIMEOUT"
            : "SUPABASE_HEALTH_NETWORK_ERROR",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  if (String(req.headers["x-hanaa-order-client"] || "") !== CLIENT_VERSION) {
    return send(res, 410, {
      ok: false,
      code: "OLD_CLIENT_DISABLED",
      refreshRequired: true,
    });
  }

  if (!validOrder(req.body)) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?on_conflict=id`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {}
      return send(res, response.status, {
        ok: false,
        code: "ORDER_WRITE_FAILED",
        detail,
      });
    }

    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, error?.name === "AbortError" ? 504 : 502, {
      ok: false,
      code:
        error?.name === "AbortError"
          ? "ORDER_WRITE_TIMEOUT"
          : "ORDER_WRITE_NETWORK_ERROR",
    });
  } finally {
    clearTimeout(timer);
  }
}

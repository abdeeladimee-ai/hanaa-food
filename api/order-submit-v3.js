const SUPABASE_URL = "https://kkmbiiiglgevwehhmtzq.supabase.co";
const SUPABASE_KEY = "sb_publishable_cqSPEkE8JbyIu9NasnOMng_GwRMKVFO";
const CLIENT_VERSION = "hanaa-orders-v3";
const WINDOW_MS = 30000;
const MAX_WRITES_PER_WINDOW = 4;
const recentByIp = new Map();
const successfulOrderIds = new Map();
const inFlightByOrderId = new Map();

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function validOrder(row) {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      /^HF[A-Z0-9]{4,24}$/i.test(String(row.id || "").trim()) &&
      ["delivery", "pickup"].includes(String(row.order_type || "")) &&
      String(row.customer_phone || "").trim() &&
      String(row.branch_id || "").trim(),
  );
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || String(req.headers["x-real-ip"] || "unknown");
}

function cleanMaps(now) {
  for (const [ip, entry] of recentByIp) {
    if (now - entry.startedAt > WINDOW_MS * 2) recentByIp.delete(ip);
  }
  for (const [id, at] of successfulOrderIds) {
    if (now - at > 5 * 60 * 1000) successfulOrderIds.delete(id);
  }
}

function allowIp(ip, now) {
  const entry = recentByIp.get(ip);
  if (!entry || now - entry.startedAt > WINDOW_MS) {
    recentByIp.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (entry.count >= MAX_WRITES_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

async function orderExists(orderId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) return false;

    const rows = await response.json();
    return Array.isArray(rows) && rows.some((row) => String(row?.id) === String(orderId));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function writeOrder(row) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      if (response.status === 409 && (await orderExists(row.id))) {
        return;
      }

      let detail = "";
      try {
        detail = (await response.text()).slice(0, 250);
      } catch {}
      const error = new Error("ORDER_WRITE_FAILED");
      error.status = response.status;
      error.detail = detail;
      throw error;
    }

    let saved = null;
    try {
      const body = await response.json();
      saved = Array.isArray(body) ? body[0] : body;
    } catch {
      saved = null;
    }

    if (!saved || String(saved.id || "") !== String(row.id)) {
      if (await orderExists(row.id)) return;

      const error = new Error("ORDER_WRITE_NOT_CONFIRMED");
      error.status = 503;
      error.detail = "Supabase did not confirm the persisted order row";
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
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
      return send(res, response.ok ? 200 : 503, {
        ok: response.ok,
        code: response.ok ? "OK" : "SUPABASE_UNAVAILABLE",
      });
    } catch (error) {
      return send(res, 503, {
        ok: false,
        code: error?.name === "AbortError" ? "HEALTH_TIMEOUT" : "HEALTH_ERROR",
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
    return send(res, 410, { ok: false, code: "OLD_CLIENT_DISABLED" });
  }

  const row = req.body;
  if (!validOrder(row)) {
    return send(res, 400, { ok: false, code: "INVALID_ORDER" });
  }

  const now = Date.now();
  cleanMaps(now);

  const id = String(row.id);

  if (successfulOrderIds.has(id)) {
    return send(res, 200, { ok: true, duplicate: true });
  }

  const existing = inFlightByOrderId.get(id);
  if (existing) {
    try {
      await existing;
      return send(res, 200, { ok: true, duplicate: true });
    } catch {
      return send(res, 503, { ok: false, code: "ORDER_WRITE_FAILED" });
    }
  }

  const ip = clientIp(req);
  if (!allowIp(ip, now)) {
    return send(res, 429, { ok: false, code: "TOO_MANY_ORDER_ATTEMPTS" });
  }

  const request = writeOrder(row);
  inFlightByOrderId.set(id, request);

  try {
    await request;
    successfulOrderIds.set(id, Date.now());
    return send(res, 200, { ok: true });
  } catch (error) {
    if (await orderExists(id)) {
      successfulOrderIds.set(id, Date.now());
      return send(res, 200, { ok: true, recovered: true });
    }

    return send(
      res,
      error?.name === "AbortError" ? 504 : (error?.status || 503),
      {
        ok: false,
        code:
          error?.name === "AbortError"
            ? "ORDER_WRITE_TIMEOUT"
            : "ORDER_WRITE_FAILED",
        detail: error?.detail || "",
      },
    );
  } finally {
    inFlightByOrderId.delete(id);
  }
}

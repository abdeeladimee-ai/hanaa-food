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
  const timer = setTimeout(() => controller.abort(), 3000);

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
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
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

    // A successful PostgREST insert is already the commit acknowledgement.
    // Only ambiguous failures need the extra existence check below.
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      code: "OK",
      writePath: "direct-supabase-client",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }


  // Order creation moved to direct browser -> Supabase writes. Keeping the
  // retired POST path alive would let stale tabs recreate the old 5xx storm.
  return send(res, 410, {
    ok: false,
    code: "CLIENT_REFRESH_REQUIRED",
    refreshRequired: true,
  });

}

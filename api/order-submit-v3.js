const CLIENT_VERSION = "hanaa-orders-v3";

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  // This endpoint is retired. Order creation now happens through the
  // current Supabase production flow, so this route must never call an
  // old/failover Supabase project.
  if (req.method === "GET") {
    return send(res, 410, {
      ok: false,
      code: "ENDPOINT_RETIRED",
      client: CLIENT_VERSION,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  return send(res, 410, {
    ok: false,
    code: "CLIENT_REFRESH_REQUIRED",
    refreshRequired: true,
  });
}

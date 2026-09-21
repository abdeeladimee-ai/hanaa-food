const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", JSON_HEADERS["Content-Type"]);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  // Legacy endpoint intentionally does not touch Supabase anymore.
  // Current clients write directly through the bounded Supabase client path.
  return send(res, 410, {
    ok: false,
    code: "LEGACY_ORDER_API_DISABLED",
    refreshRequired: true,
  });
}

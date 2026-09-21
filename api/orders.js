function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  return send(res, 410, {
    ok: false,
    code: "LEGACY_ORDER_ROUTE_DISABLED",
    refreshRequired: true,
  });
}

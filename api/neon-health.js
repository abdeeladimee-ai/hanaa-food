function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default function handler(_req, res) {
  return send(res, 410, {
    ok: false,
    code: "NEON_DISABLED",
    backend: "supabase",
  });
}

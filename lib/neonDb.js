function disabledError() {
  const error = new Error("NEON_DISABLED");
  error.code = "NEON_DISABLED";
  return error;
}

export function getPool() {
  throw disabledError();
}

export async function ensureSchema() {
  throw disabledError();
}

export function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

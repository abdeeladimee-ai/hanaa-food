import pg from "pg";

const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL_MISSING");
    error.code = "DATABASE_URL_MISSING";
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const db = getPool();
    const result = await db.query("select now() as now, current_database() as database");
    return res.status(200).json({
      ok: true,
      database: result.rows?.[0]?.database || null,
      now: result.rows?.[0]?.now || null,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      code: error?.code || "NEON_UNAVAILABLE",
    });
  }
}

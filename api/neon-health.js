import { getPool } from "../lib/neonDb.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const result = await getPool().query(
      "select now() as now, current_database() as database",
    );
    return res.status(200).json({
      ok: true,
      database: result.rows?.[0]?.database || null,
      now: result.rows?.[0]?.now || null,
    });
  } catch (error) {
    console.error("neon health failed", error);
    return res.status(503).json({
      ok: false,
      code: error?.code || "NEON_UNAVAILABLE",
    });
  }
}

import { getPool } from "../lib/neonPool.js";

export default async function handler(req, res) {
  try {
    const result = await getPool().query("select 1 as ok");
    return res.status(200).json({ ok: result.rows?.[0]?.ok === 1 });
  } catch (error) {
    return res.status(503).json({ ok: false, code: error?.code || "DB_ERROR" });
  }
}

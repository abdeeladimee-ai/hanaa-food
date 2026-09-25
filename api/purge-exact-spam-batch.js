import { getPool } from "../lib/neonDb.js";

const PURGE_KEY = "Purge-81698-Hanaa-20260925-x7QvN4";
const SPAM_TIMESTAMP = "2026-09-25T20:14:46.697Z";
const EXPECTED_COUNT = 81698;

export default async function handler(req, res) {
  if (String(req.query?.key || "") !== PURGE_KEY) {
    return res.status(403).json({ ok: false, code: "FORBIDDEN" });
  }

  const db = getPool();
  const before = await db.query(
    "select count(*)::int as count from public.orders where created_at = $1::timestamptz",
    [SPAM_TIMESTAMP],
  );
  const count = Number(before.rows[0]?.count || 0);

  if (count !== EXPECTED_COUNT) {
    return res.status(409).json({
      ok: false,
      code: "SAFETY_COUNT_MISMATCH",
      expected: EXPECTED_COUNT,
      found: count,
    });
  }

  const deleted = await db.query(
    "delete from public.orders where created_at = $1::timestamptz returning id",
    [SPAM_TIMESTAMP],
  );
  const total = await db.query("select count(*)::int as count from public.orders");

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    deleted: deleted.rowCount,
    remaining: Number(total.rows[0]?.count || 0),
  });
}

import { getPool } from "../lib/neonDb.js";

const DIAGNOSTIC_KEY = "0wctA7fX3J8dP2yK9N6mQ4sL1vR5zH";

export default async function handler(req, res) {
  if (String(req.query?.key || "") !== DIAGNOSTIC_KEY) {
    return res.status(403).json({ ok: false });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const result = await getPool().query(
    `select
       regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g') as phone,
       count(*)::int as count,
       min(created_at) as first_at,
       max(created_at) as last_at,
       count(distinct branch_id)::int as branches,
       count(distinct customer_name)::int as names
     from public.orders
     group by 1
     order by count(*) desc
     limit 20`
  );

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true, rows: result.rows });
}

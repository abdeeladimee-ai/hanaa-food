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

  const db = getPool();
  const phones = await db.query(
    `select
       regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g') as phone,
       count(*)::int as count,
       min(created_at) as first_at,
       max(created_at) as last_at
     from public.orders
     group by 1
     order by count(*) desc
     limit 20`
  );
  const timestamps = await db.query(
    `select created_at, count(*)::int as count,
            count(distinct customer_phone)::int as phones,
            count(distinct customer_name)::int as names,
            count(distinct branch_id)::int as branches
       from public.orders
      group by created_at
      order by count(*) desc
      limit 20`
  );
  const names = await db.query(
    `select coalesce(customer_name,'') as name, count(*)::int as count
       from public.orders
      group by 1
      order by count(*) desc
      limit 20`
  );
  const branches = await db.query(
    `select coalesce(branch_id,'') as branch, count(*)::int as count
       from public.orders
      group by 1
      order by count(*) desc`
  );
  const total = await db.query("select count(*)::int as count from public.orders");

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    total: total.rows[0]?.count || 0,
    phones: phones.rows,
    timestamps: timestamps.rows,
    names: names.rows,
    branches: branches.rows,
  });
}

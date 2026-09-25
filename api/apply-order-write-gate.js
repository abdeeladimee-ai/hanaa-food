import { getPool } from "../lib/neonDb.js";

const APPLY_KEY = "Hanaa-Apply-Order-Gate-20260925-k9P4sT2m";

export default async function handler(req, res) {
  if (String(req.query?.key || "") !== APPLY_KEY) {
    return res.status(403).json({ ok: false, code: "FORBIDDEN" });
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query("begin");

    await client.query(`
      create or replace function public.hanaa_enforce_order_write_gate()
      returns trigger
      language plpgsql
      as $$
      begin
        if current_setting('app.hanaa_order_ingress', true)
           is distinct from 'hanaa-ingress-v3-20260925-4vQ8mL7nX2' then
          raise exception 'ORDER_WRITE_GATE_REJECTED'
            using errcode = '42501';
        end if;
        return new;
      end;
      $$;
    `);

    await client.query(
      "drop trigger if exists hanaa_order_write_gate on public.orders",
    );

    await client.query(`
      create trigger hanaa_order_write_gate
      before insert or update on public.orders
      for each row
      execute function public.hanaa_enforce_order_write_gate()
    `);

    const check = await client.query(`
      select count(*)::int as count
        from pg_trigger
       where tgname = 'hanaa_order_write_gate'
         and tgrelid = 'public.orders'::regclass
         and not tgisinternal
    `);

    if (Number(check.rows[0]?.count || 0) !== 1) {
      throw new Error("ORDER_WRITE_GATE_NOT_INSTALLED");
    }

    await client.query("commit");
    return res.status(200).json({ ok: true, triggerInstalled: true });
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    console.error("apply order write gate failed", error);
    return res.status(500).json({
      ok: false,
      code: error?.message || "ORDER_WRITE_GATE_FAILED",
    });
  } finally {
    client.release();
  }
}

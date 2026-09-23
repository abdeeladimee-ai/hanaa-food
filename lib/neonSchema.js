import { getPool } from "./neonPool.js";

let ready = false;
let pending = null;

const sql = `
create table if not exists public.orders (
  id text primary key,
  customer_name text,
  customer_phone text,
  order_type text not null check (order_type in ('delivery','pickup')),
  branch_id text not null,
  branch_name text,
  delivery_address text not null default '',
  customer_latitude double precision,
  customer_longitude double precision,
  distance_km double precision,
  estimated_travel_time integer,
  delivery_fee numeric(12,2) not null default 0,
  payment_method text,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status integer not null default 0,
  status_label text,
  items jsonb not null default '[]'::jsonb,
  status_history jsonb not null default '[]'::jsonb,
  driver_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_branch_created_idx
  on public.orders (branch_id, created_at desc);

create index if not exists orders_updated_idx
  on public.orders (updated_at desc);
`;

export async function ensureOrdersSchema() {
  if (ready) return;
  if (!pending) {
    pending = getPool().query(sql).then(() => {
      ready = true;
    }).finally(() => {
      pending = null;
    });
  }
  await pending;
}

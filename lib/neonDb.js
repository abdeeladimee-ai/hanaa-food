import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

function createPool() {
  if (!connectionString) {
    const error = new Error("DATABASE_URL_MISSING");
    error.code = "DATABASE_URL_MISSING";
    throw error;
  }

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
}

export function getPool() {
  if (!globalThis.__hanaaNeonPool) {
    globalThis.__hanaaNeonPool = createPool();
  }
  return globalThis.__hanaaNeonPool;
}

let schemaReady = false;
let schemaPromise = null;

const schemaSql = `
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

create index if not exists orders_driver_idx
  on public.orders (driver_id)
  where driver_id is not null;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('customer_ordering', '{"paused": true}'::jsonb)
on conflict (key) do nothing;
`;

export async function ensureSchema() {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = getPool().query(schemaSql).then(() => {
      schemaReady = true;
    }).finally(() => {
      schemaPromise = null;
    });
  }
  await schemaPromise;
}

export function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

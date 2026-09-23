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

create table if not exists public.staff_accounts (
  id text primary key,
  email text,
  phone text,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('ADMIN','SNACK','LIVREUR')),
  branch_id text,
  branch_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_accounts_email_unique
  on public.staff_accounts (lower(email))
  where email is not null;

create unique index if not exists staff_accounts_phone_unique
  on public.staff_accounts (phone)
  where phone is not null;

create table if not exists public.staff_sessions (
  token_hash text primary key,
  account_id text not null references public.staff_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_sessions_account_idx
  on public.staff_sessions (account_id);

insert into public.staff_accounts
  (id,email,phone,name,password_hash,role,branch_id,branch_name,active)
values
  ('admin-dev','admin@hanaa-food.test',null,'admin','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4','ADMIN',null,null,true),
  ('snack-tadart-dev','snack@hanaa-food.test',null,'Caisse Tadart','00e38a2374c9eb01d3e7f763a549028a07fcaea6478e3f01f899364baa40c96b','SNACK','tadart','Hanaa Food Tadart',true),
  ('snack-jnan-tadart',null,'0630012136','Caisse Jnan Tadart','d150f3db3cdbaa934c701b9b98dfdeace78542ecff20ce3713abbd5bd4920d04','SNACK','tadart','Hanaa Food Tadart',true),
  ('snack-amgala-dev','amgala@hanaa-food.test',null,'Caisse Amgala','36758f157740a12393c885a7fa45ce0957447cb1ca836f5e6b25bf656046f420','SNACK','amgala','Hanaa Food Amgala',true),
  ('snack-rue-baghdad-dev','baghdad@hanaa-food.test',null,'Hajar','f80640ac2bbd19fc684156554cf440be40785417123617554356bca7a9688055','SNACK','rue-baghdad','Hanaa Food Rue Baghdad',true),
  ('driver-dev','livreur@hanaa-food.test',null,'Livreur 1','494d022492052a06f8f81949639a1d148c1051fa3d4e4688fbd96efe649cd382','LIVREUR',null,null,true)
on conflict (id) do nothing;
`;

export async function ensureSchema() {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = getPool()
      .query(schemaSql)
      .then(() => {
        schemaReady = true;
      })
      .finally(() => {
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

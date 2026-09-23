import pg from "pg";

const { Pool } = pg;

export function getPool() {
  if (!globalThis.__hanaaPool) {
    globalThis.__hanaaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
  }
  return globalThis.__hanaaPool;
}

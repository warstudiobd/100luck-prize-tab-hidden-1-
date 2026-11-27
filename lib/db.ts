import { Pool, PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn("[db] DATABASE_URL is not set — API routes will fail until it is configured.");
}

declare global { // eslint-disable-next-line no-var
  var __sonali7Pool: Pool | undefined;
}

/**
 * Serverless connection pool — sized for Vercel, not for a single server.
 *
 * THE BUG THIS REPLACES: `max: 10` meant every warm lambda instance could open ten
 * Postgres connections. A traffic spike fans out into dozens of instances, each holding
 * ten, and Supabase answers "too many clients already" — the site goes down exactly when
 * it is busiest, and it looks like a database outage rather than a config problem.
 *
 * One lambda serves at most a handful of requests at a time, so a small pool is not a
 * bottleneck: it is the correct size. The Supabase pooler in front (port 6543,
 * transaction mode) is what absorbs the aggregate across instances.
 *
 * `statement_timeout` is set so a stuck query cannot pin a connection forever and take
 * the whole pool with it — a slower query fails visibly instead of hanging the site.
 */
const POOL_MAX = Number(process.env.DB_POOL_MAX || 3);

export const pool: Pool =
  globalThis.__sonali7Pool ??
  new Pool({
    connectionString,
    max: Number.isFinite(POOL_MAX) && POOL_MAX > 0 ? POOL_MAX : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    /* Supabase's pooler drops idle connections; without allowExitOnIdle a warm lambda
       can hold a dead socket and the next request pays a timeout. */
    allowExitOnIdle: true,
    keepAlive: true,
    options: "-c statement_timeout=15000",
    application_name: "100luck-web",
  });

/* Cache the pool on the global in every environment. Vercel reruns module init when it
   spins up an instance, and in dev the bundler reloads modules on every edit — without
   this the old pool is orphaned and the new one opens fresh connections until the
   database refuses them. */
globalThis.__sonali7Pool = pool;

/* A pool-level error (the database went away mid-idle) must not crash the process. Log it
   and let the next query reconnect; an unhandled 'error' event kills the lambda. */
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] idle client error:", err?.message);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

/** ACID transaction wrapper: BEGIN → fn(client) → COMMIT, ROLLBACK on error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* connection may be dead */ }
    throw err;
  } finally {
    client.release();
  }
}

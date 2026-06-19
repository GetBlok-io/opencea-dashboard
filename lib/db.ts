import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var reportedStatePool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

export const pool = global.reportedStatePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.reportedStatePool = pool;
}

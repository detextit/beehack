import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error(
    "No database URL found. Set DATABASE_URL (or POSTGRES_URL) in .env.local."
  );
}

declare global {
  var __beehivePool: Pool | undefined;
}

export const pool =
  global.__beehivePool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? false
      : {
          rejectUnauthorized: false,
        },
  });

if (!global.__beehivePool) {
  global.__beehivePool = pool;
}

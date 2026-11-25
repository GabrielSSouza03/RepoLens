import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@repolens/shared";

export const DB = Symbol("DB");

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString?: string) {
  const pool = new Pool({
    connectionString:
      connectionString ??
      process.env.DATABASE_URL ??
      "postgres://repolens:repolens@localhost:5432/repolens",
  });
  return drizzle(pool, { schema });
}

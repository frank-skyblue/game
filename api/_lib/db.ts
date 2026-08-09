import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export const getSql = (): NeonQueryFunction<false, false> => {
  if (sql) {
    return sql;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }
  sql = neon(url);
  return sql;
};

/**
 * Neon serializes JS arrays as Postgres arrays, not JSON.
 * Stringify and cast so jsonb columns receive valid JSON text.
 */
export const asJsonb = (value: unknown): string => JSON.stringify(value);

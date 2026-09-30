import { drizzle } from "drizzle-orm/bun-sql";

export function createDb(databaseUrl: string) {
  return drizzle(databaseUrl);
}

export type Db = ReturnType<typeof createDb>;

import { drizzle } from "drizzle-orm/bun-sql";
import { getConfig } from "~/lib/config.ts";

export const db = drizzle(getConfig().databaseUrl);

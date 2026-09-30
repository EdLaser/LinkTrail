import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { createDb, type Db } from "~/db/index";
import { parseConfig, type AppConfig } from "~/lib/config";
import { HammerheadClient } from "~/lib/hammerhead/client";

export interface Deps {
  config: AppConfig;
  db: Db;
  hammerhead: HammerheadClient;
}

export type AppEnv = { Variables: Deps };

// Built once from the first request's env so the DB pool is shared across requests
let deps: Deps | undefined;

/** Resolves config via Hono's runtime-agnostic `env()` helper and exposes it on `c.var`. */
export const depsMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (!deps) {
    const config = parseConfig(env<Record<string, string | undefined>>(c));
    deps = { config, db: createDb(config.databaseUrl), hammerhead: new HammerheadClient(config) };
  }
  c.set("config", deps.config);
  c.set("db", deps.db);
  c.set("hammerhead", deps.hammerhead);
  await next();
});

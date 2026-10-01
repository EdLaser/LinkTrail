import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import type { JwtVariables } from "hono/jwt";
import type { RequestIdVariables } from "hono/request-id";
import { createDb, type Db } from "~/db/index";
import { parseConfig, type AppConfig } from "~/lib/config";
import { HammerheadClient } from "~/lib/hammerhead/client";
import { createProviders, type RouteProviderId } from "~/lib/providers/index";
import type { RouteProvider } from "~/lib/providers/types";

export interface Deps {
  config: AppConfig;
  db: Db;
  hammerhead: HammerheadClient;
  providers: Record<RouteProviderId, RouteProvider>;
}

export type AppEnv = { Variables: Deps & JwtVariables & RequestIdVariables };

// Built once from the first request's env so the DB pool is shared across requests
let deps: Deps | undefined;

/** Resolves config via Hono's runtime-agnostic `env()` helper and exposes it on `c.var`. */
export const depsMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (!deps) {
    const config = parseConfig(env<Record<string, string | undefined>>(c));
    deps = {
      config,
      db: createDb(config.databaseUrl),
      hammerhead: new HammerheadClient(config),
      providers: createProviders(config),
    };
  }
  c.set("config", deps.config);
  c.set("db", deps.db);
  c.set("hammerhead", deps.hammerhead);
  c.set("providers", deps.providers);
  await next();
});

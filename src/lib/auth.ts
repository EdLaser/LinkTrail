import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwt } from "hono/jwt";
import { z } from "zod";
import { requireUser } from "~/lib/http";
import type { AppEnv } from "~/lib/deps";

/** Verifies the HS256 bearer token; the secret comes from per-request config, so it's wired lazily. */
export const requireAuth = createMiddleware<AppEnv>((c, next) =>
  jwt({ secret: c.var.config.jwtSecret, alg: "HS256" })(c, next),
);

const payloadSchema = z.object({ sub: z.uuid() });

/** Loads the app user identified by the token's `sub` claim. Use after `requireAuth`. */
export async function requireAuthUser(c: Context<AppEnv, any, any>) {
  const payload = payloadSchema.safeParse(c.get("jwtPayload"));
  if (!payload.success) {
    throw new HTTPException(401, { message: "Token subject must be an app user id" });
  }
  return requireUser(c.var.db, payload.data.sub);
}

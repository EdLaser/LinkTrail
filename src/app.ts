import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { createLogger } from "~/lib/logger.ts";
import { depsMiddleware } from "~/lib/deps";
import { securityHeadersMiddleware } from "~/lib/security";
import { createRouter } from "~/lib/openapi";
import { oauthRoutes } from "~/routes/oauth";
import { syncRoutes } from "~/routes/sync";

const appLogger = createLogger("app");

export const app = createRouter();

app.use(requestId());
app.use(depsMiddleware);
app.use(securityHeadersMiddleware());

app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check",
  responses: {
    200: {
      description: "Service is up",
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
    },
  },
});

app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));
app.route("/", oauthRoutes);
app.route("/", syncRoutes);

app.doc("/doc", {
  openapi: "3.0.0",
  info: { title: "LinkTrail", version: "1.0.0" },
});

app.onError((err, c) => {
  const reqId = c.get("requestId");
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  appLogger.error({ err, requestId: reqId }, "Unhandled error");
  return c.json({ error: "Internal Server Error" }, 500);
});

import { createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { depsMiddleware } from "~/lib/deps.ts";
import { createRouter } from "~/lib/openapi.ts";
import { oauthRoutes } from "~/routes/oauth.ts";
import { syncRoutes } from "~/routes/sync.ts";

export const app = createRouter();

app.use(depsMiddleware);

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
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { depsMiddleware, type AppEnv } from "~/lib/deps.ts";
import { oauthRoutes } from "~/routes/oauth.ts";
import { syncRoutes } from "~/routes/sync.ts";

export const app = new Hono<AppEnv>();

app.use(depsMiddleware);
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/", oauthRoutes);
app.route("/", syncRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

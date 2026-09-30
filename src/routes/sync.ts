import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { hammerheadAccounts } from "~/db/schema";
import { requireAuth, requireAuthUser } from "~/lib/auth";
import { createRouter, errorResponse } from "~/lib/openapi";
import { PROVIDER_IDS } from "~/lib/providers/index";
import { ProviderError } from "~/lib/providers/types";
import { syncRoute } from "~/lib/routeSyncService";

export const syncRoutes = createRouter();

const syncRouteDef = createRoute({
  method: "post",
  path: "/api/sync/route",
  tags: ["Sync"],
  summary: "Fetch a route from a provider and sync it to Hammerhead",
  description:
    "Creates, updates or skips the route depending on the file checksum reported by the provider.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            provider: z.enum(PROVIDER_IDS).openapi({ description: "Route provider" }),
            source_route_id: z
              .string()
              .min(1)
              .openapi({ description: "The route's ID at the provider" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Sync result",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            action: z.enum(["created", "updated", "skipped"]),
            alreadySynced: z.boolean(),
            checksum: z.string(),
            routeId: z.string(),
            hammerheadRouteId: z.string(),
          }),
        },
      },
    },
    400: errorResponse("Invalid parameters"),
    401: errorResponse("Missing or invalid bearer token"),
    403: errorResponse("User has not connected a Hammerhead account"),
    404: errorResponse("User, or route at the provider, not found"),
    502: errorResponse("Fetching from the provider or syncing with Hammerhead failed"),
  },
});

syncRoutes.use(syncRouteDef.getRoutingPath(), requireAuth);

syncRoutes.openapi(syncRouteDef, async (c) => {
  const { db } = c.var;
  const user = await requireAuthUser(c);

  const [account] = await db
    .select({ id: hammerheadAccounts.id })
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, user.id))
    .limit(1);
  if (!account) {
    throw new HTTPException(403, { message: "User has not connected Hammerhead account" });
  }

  const { provider, source_route_id } = c.req.valid("json");

  try {
    const result = await syncRoute(c.var, user.id, { provider, routeId: source_route_id });

    return c.json(
      {
        success: true,
        message: result.message,
        action: result.action,
        alreadySynced: result.action === "skipped",
        checksum: result.checksum,
        routeId: result.routeId,
        hammerheadRouteId: result.hammerheadRouteId,
      },
      200,
    );
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "not_found") {
      throw new HTTPException(404, { message: err.message });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new HTTPException(502, { message: msg });
  }
});

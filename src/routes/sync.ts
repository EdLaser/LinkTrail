import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { hammerheadAccounts } from "~/db/schema.ts";
import { requireUser } from "~/lib/http.ts";
import { createRouter, errorResponse } from "~/lib/openapi.ts";
import { getFormatFromFilename, MAX_FILE_SIZE } from "~/lib/routeFormats.ts";
import { syncRoute } from "~/lib/routeSyncService.ts";

export const syncRoutes = createRouter();

// Headroom for the other multipart fields and boundaries around the file
const MULTIPART_OVERHEAD = 64 * 1024;

const syncRouteDef = createRoute({
  method: "post",
  path: "/api/sync/route",
  tags: ["Sync"],
  summary: "Upload a route file and sync it to Hammerhead",
  description:
    "Creates, updates or skips the route depending on the file checksum. Supported formats: GPX, FIT, TCX, KML, KMZ.",
  // TODO: take user_id from a session/JWT instead of the query
  request: {
    query: z.object({ user_id: z.uuid() }),
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
            bikemap_route_id: z.string().optional(),
            route_name: z.string().optional(),
            description: z.string().optional(),
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
    400: errorResponse("Invalid parameters or unsupported file"),
    403: errorResponse("User has not connected a Hammerhead account"),
    404: errorResponse("User not found"),
    413: errorResponse("File too large"),
    502: errorResponse("Sync with Hammerhead failed"),
  },
});

syncRoutes.use(
  syncRouteDef.getRoutingPath(),
  bodyLimit({
    maxSize: MAX_FILE_SIZE + MULTIPART_OVERHEAD,
    onError: () => {
      throw new HTTPException(413, {
        message: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      });
    },
  }),
);

syncRoutes.openapi(syncRouteDef, async (c) => {
  const { db } = c.var;
  const user = await requireUser(db, c.req.valid("query").user_id);

  const [account] = await db
    .select({ id: hammerheadAccounts.id })
    .from(hammerheadAccounts)
    .where(eq(hammerheadAccounts.appUserId, user.id))
    .limit(1);
  if (!account) {
    throw new HTTPException(403, { message: "User has not connected Hammerhead account" });
  }

  const { file, bikemap_route_id, route_name, description } = c.req.valid("form");

  if (!file.name) {
    throw new HTTPException(400, { message: "File must have a filename" });
  }
  if (!getFormatFromFilename(file.name)) {
    throw new HTTPException(400, {
      message: "Unsupported file format. Supported: GPX, FIT, TCX, KML, KMZ",
    });
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new HTTPException(413, {
      message: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    });
  }

  try {
    const result = await syncRoute(
      c.var,
      user.id,
      bikemap_route_id || `local_${Date.now()}`,
      Buffer.from(await file.arrayBuffer()),
      file.name,
      route_name,
      description,
    );

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
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new HTTPException(502, { message: msg });
  }
});

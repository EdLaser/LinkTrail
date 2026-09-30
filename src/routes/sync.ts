import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { db } from "~/db/index.ts";
import { hammerheadAccounts } from "~/db/schema.ts";
import { getFormatFromFilename, MAX_FILE_SIZE } from "~/lib/routeFormats.ts";
import { requireUser } from "~/lib/http.ts";
import { syncRoute } from "~/lib/routeSyncService.ts";

export const syncRoutes = new Hono();

// Headroom for the other multipart fields and boundaries around the file
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * POST /api/sync/route
 * Multipart form: file (GPX/FIT/TCX/KML/KMZ), bikemap_route_id?, route_name?, description?
 * Query: user_id (TODO: take from a session/JWT)
 */
syncRoutes.post(
  "/api/sync/route",
  bodyLimit({
    maxSize: MAX_FILE_SIZE + MULTIPART_OVERHEAD,
    onError: () => {
      throw new HTTPException(413, {
        message: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      });
    },
  }),
  async (c) => {
    const user = await requireUser(c.req.query("user_id"));

    const [account] = await db
      .select({ id: hammerheadAccounts.id })
      .from(hammerheadAccounts)
      .where(eq(hammerheadAccounts.appUserId, user.id))
      .limit(1);
    if (!account) {
      throw new HTTPException(403, { message: "User has not connected Hammerhead account" });
    }

    let form;
    try {
      form = await c.req.parseBody();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new HTTPException(400, { message: `Failed to parse form data: ${msg}` });
    }

    const file = form.file;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "No file provided in form data" });
    }
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

    const field = (name: string) => (typeof form[name] === "string" ? form[name] : undefined);
    const bikemapRouteId = field("bikemap_route_id") || `local_${Date.now()}`;

    try {
      const result = await syncRoute(
        user.id,
        bikemapRouteId,
        Buffer.from(await file.arrayBuffer()),
        file.name,
        field("route_name"),
        field("description"),
      );

      return c.json({
        success: true,
        message: result.message,
        action: result.action,
        alreadySynced: result.action === "skipped",
        checksum: result.checksum,
        routeId: result.routeId,
        hammerheadRouteId: result.hammerheadRouteId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new HTTPException(502, { message: msg });
    }
  },
);

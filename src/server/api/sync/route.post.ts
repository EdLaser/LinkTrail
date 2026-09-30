/**
 * POST /api/sync/route
 * Ingest a route file for syncing to Hammerhead
 *
 * Request:
 *   - Multipart form data with:
 *     - file: Route file (GPX, FIT, TCX, KML, KMZ)
 *     - bikemap_route_id (optional): ID from Bikemap source
 *     - route_name (optional): Name for the route
 *     - description (optional): Route description
 *   - Query param user_id: App user ID (TODO: get from session)
 *
 * Response:
 *   {
 *     "success": boolean,
 *     "message": string,
 *     "checksum": string (SHA-256),
 *     "alreadySynced": boolean,
 *     "routeId": string (database SyncedRoute ID)
 *   }
 */

import { db } from "~/server/utils/db.ts";
import { syncRoute } from "~/server/utils/routeSyncService.ts";
import { getFormatFromFilename, MAX_FILE_SIZE } from "~/server/utils/routeFormats.ts";
import { computeChecksum } from "~/server/utils/checksumService.ts";

export default defineEventHandler(async (event) => {
  // TODO: In production, get user_id from session/JWT
  const queryUserId = getQuery(event).user_id as string | undefined;

  if (!queryUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required parameter: user_id",
    });
  }

  const userId = queryUserId;

  // Verify user exists
  const appUser = await db.appUser.findUnique({
    where: { id: userId },
  });

  if (!appUser) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    });
  }

  // Check if user has connected Hammerhead account
  const hammerheadAccount = await db.hammerheadAccount.findUnique({
    where: { appUserId: userId },
  });

  if (!hammerheadAccount) {
    throw createError({
      statusCode: 403,
      statusMessage: "User has not connected Hammerhead account",
    });
  }

  // Parse multipart form data
  let form;
  try {
    form = await readMultipartFormData(event);
    if (!form || form.length === 0) {
      throw new Error("No form data provided");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw createError({
      statusCode: 400,
      statusMessage: `Failed to parse form data: ${msg}`,
    });
  }

  // Extract file and metadata from form
  const files = form.filter((f) => f.name === "file");
  if (files.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file provided in form data",
    });
  }

  const file = files[0];
  if (!file.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: "File must have a filename",
    });
  }

  // Extract optional metadata from form
  const bikemapRouteIdField = form.find((f) => f.name === "bikemap_route_id");
  const routeNameField = form.find((f) => f.name === "route_name");
  const descriptionField = form.find((f) => f.name === "description");

  const bikemapRouteId = bikemapRouteIdField
    ? bikemapRouteIdField.data.toString()
    : `local_${Date.now()}`;
  const routeName = routeNameField ? routeNameField.data.toString() : undefined;
  const description = descriptionField ? descriptionField.data.toString() : undefined;

  // Validate file format
  const format = getFormatFromFilename(file.filename);
  if (!format) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported file format. Supported: GPX, FIT, TCX, KML, KMZ`,
    });
  }

  // Validate file size
  const fileBuffer = file.data;
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    });
  }

  // Compute checksum
  const checksum = computeChecksum(fileBuffer);

  // Check if this exact file has already been synced
  const existingSyncedRoute = await db.syncedRoute.findFirst({
    where: {
      appUserId: userId,
      checksum,
    },
  });

  if (existingSyncedRoute) {
    return {
      success: true,
      message: "Route file already synced",
      checksum,
      alreadySynced: true,
      routeId: existingSyncedRoute.id,
    };
  }

  // Get access token (will auto-refresh if needed)
  let accessToken;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw createError({
      statusCode: 401,
      statusMessage: `Failed to get access token: ${msg}`,
    });
  }

  // Upload to Hammerhead
  let uploadResponse;
  try {
    uploadResponse = await hammerheadClient.createRoute(
      accessToken,
      fileBuffer,
      file.filename,
      routeName,
      description,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to upload route to Hammerhead: ${msg}`,
    });
  }

  // Store sync mapping
  try {
    const syncedRoute = await db.syncedRoute.create({
      data: {
        appUserId: userId,
        bikemapRouteId,
        hammerheadRouteId: uploadResponse.id,
        checksum,
        lastSyncedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Route successfully uploaded to Hammerhead",
      checksum,
      alreadySynced: false,
      routeId: syncedRoute.id,
      hammerheadRouteId: uploadResponse.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to store sync mapping: ${msg}`,
    });
  }
});

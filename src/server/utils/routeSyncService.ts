/**
 * Route sync service
 * Core logic for syncing routes between Bikemap and Hammerhead
 * Handles create/update/skip decisions based on checksums
 */

import { db } from "~/server/utils/db";
import { getValidAccessToken } from "~/server/utils/tokenService";
import { hammerheadClient } from "~/server/utils/hammerhead/client";
import { computeChecksum } from "~/server/utils/checksumService";

export interface SyncResult {
  routeId: string;
  hammerheadRouteId: string;
  action: "created" | "updated" | "skipped";
  checksum: string;
  message: string;
}

/**
 * Sync a route file to Hammerhead
 *
 * Logic:
 * 1. If route exists in SyncedRoute table with same checksum → SKIP
 * 2. If route exists in SyncedRoute table with different checksum → UPDATE
 * 3. If route doesn't exist in SyncedRoute table → CREATE
 */
export async function syncRoute(
  userId: string,
  bikemapRouteId: string,
  fileBuffer: Buffer,
  filename: string,
  routeName?: string,
  description?: string,
): Promise<SyncResult> {
  // Compute checksum of incoming file
  const newChecksum = computeChecksum(fileBuffer);

  // Check existing sync record
  const existingSync = await db.syncedRoute.findFirst({
    where: {
      appUserId: userId,
      bikemapRouteId,
    },
  });

  // SKIP: File unchanged
  if (existingSync && existingSync.checksum === newChecksum) {
    return {
      routeId: existingSync.id,
      hammerheadRouteId: existingSync.hammerheadRouteId,
      action: "skipped",
      checksum: newChecksum,
      message: "Route file unchanged; skipping sync",
    };
  }

  // Get access token (with auto-refresh)
  const accessToken = await getValidAccessToken(userId);

  let hammerheadRouteId: string;
  let action: "created" | "updated";

  if (existingSync) {
    // UPDATE: Route exists but file changed
    try {
      const response = await hammerheadClient.updateRoute(
        accessToken,
        existingSync.hammerheadRouteId,
        fileBuffer,
        filename,
        routeName,
        description,
      );
      hammerheadRouteId = response.id;
      action = "updated";

      // Update sync record
      await db.syncedRoute.update({
        where: { id: existingSync.id },
        data: {
          checksum: newChecksum,
          lastSyncedAt: new Date(),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Failed to update route on Hammerhead: ${msg}`);
    }
  } else {
    // CREATE: New route
    try {
      const response = await hammerheadClient.createRoute(
        accessToken,
        fileBuffer,
        filename,
        routeName,
        description,
      );
      hammerheadRouteId = response.id;
      action = "created";

      // Create sync record
      await db.syncedRoute.create({
        data: {
          appUserId: userId,
          bikemapRouteId,
          hammerheadRouteId,
          checksum: newChecksum,
          lastSyncedAt: new Date(),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Failed to create route on Hammerhead: ${msg}`);
    }
  }

  return {
    routeId: existingSync?.id || `new_${Date.now()}`,
    hammerheadRouteId,
    action,
    checksum: newChecksum,
    message: `Route ${action} successfully on Hammerhead`,
  };
}

/**
 * Batch sync multiple routes
 * Returns results for each route with any errors captured
 */
export async function batchSyncRoutes(
  userId: string,
  routes: Array<{
    bikemapRouteId: string;
    fileBuffer: Buffer;
    filename: string;
    routeName?: string;
    description?: string;
  }>,
): Promise<{
  successful: SyncResult[];
  failed: Array<{ bikemapRouteId: string; error: string }>;
}> {
  const results: SyncResult[] = [];
  const errors: Array<{ bikemapRouteId: string; error: string }> = [];

  for (const route of routes) {
    try {
      const result = await syncRoute(
        userId,
        route.bikemapRouteId,
        route.fileBuffer,
        route.filename,
        route.routeName,
        route.description,
      );
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push({
        bikemapRouteId: route.bikemapRouteId,
        error: msg,
      });
    }
  }

  return {
    successful: results,
    failed: errors,
  };
}

/**
 * Get sync status for a route
 */
export async function getRouteSyncStatus(
  userId: string,
  bikemapRouteId: string,
): Promise<{
  isSynced: boolean;
  hammerheadRouteId?: string;
  checksum?: string;
  lastSyncedAt?: Date;
}> {
  const sync = await db.syncedRoute.findFirst({
    where: {
      appUserId: userId,
      bikemapRouteId,
    },
  });

  if (!sync) {
    return { isSynced: false };
  }

  return {
    isSynced: true,
    hammerheadRouteId: sync.hammerheadRouteId,
    checksum: sync.checksum,
    lastSyncedAt: sync.lastSyncedAt,
  };
}

/**
 * List all synced routes for a user
 */
export async function listSyncedRoutes(userId: string) {
  return db.syncedRoute.findMany({
    where: { appUserId: userId },
    select: {
      id: true,
      bikemapRouteId: true,
      hammerheadRouteId: true,
      checksum: true,
      lastSyncedAt: true,
    },
    orderBy: { lastSyncedAt: "desc" },
  });
}

/**
 * Route sync service
 * Core logic for syncing routes between Bikemap and Hammerhead
 * Handles create/update/skip decisions based on checksums
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "~/db/index.ts";
import { syncedRoutes } from "~/db/schema.ts";
import { getValidAccessToken } from "~/lib/tokenService.ts";
import { hammerheadClient } from "~/lib/hammerhead/client.ts";
import { computeChecksum } from "~/lib/checksumService.ts";

export interface SyncResult {
  routeId: string;
  hammerheadRouteId: string;
  action: "created" | "updated" | "skipped";
  checksum: string;
  message: string;
}

async function findSyncedRoute(userId: string, bikemapRouteId: string) {
  const [row] = await db
    .select()
    .from(syncedRoutes)
    .where(and(eq(syncedRoutes.appUserId, userId), eq(syncedRoutes.bikemapRouteId, bikemapRouteId)))
    .limit(1);
  return row;
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
  const newChecksum = computeChecksum(fileBuffer);
  const existingSync = await findSyncedRoute(userId, bikemapRouteId);

  if (existingSync && existingSync.checksum === newChecksum) {
    return {
      routeId: existingSync.id,
      hammerheadRouteId: existingSync.hammerheadRouteId,
      action: "skipped",
      checksum: newChecksum,
      message: "Route file unchanged; skipping sync",
    };
  }

  const accessToken = await getValidAccessToken(userId);

  if (existingSync) {
    try {
      const response = await hammerheadClient.updateRoute(
        accessToken,
        existingSync.hammerheadRouteId,
        fileBuffer,
        filename,
        routeName,
        description,
      );

      await db
        .update(syncedRoutes)
        .set({
          name: response.name,
          description: description ?? existingSync.description,
          distance: response.distance,
          elevationGain: response.elevationGain,
          checksum: newChecksum,
          lastSyncedAt: new Date(),
        })
        .where(eq(syncedRoutes.id, existingSync.id));

      return {
        routeId: existingSync.id,
        hammerheadRouteId: response.id,
        action: "updated",
        checksum: newChecksum,
        message: "Route updated successfully on Hammerhead",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Failed to update route on Hammerhead: ${msg}`);
    }
  }

  try {
    const response = await hammerheadClient.createRoute(
      accessToken,
      fileBuffer,
      filename,
      routeName,
      description,
    );

    const [created] = await db
      .insert(syncedRoutes)
      .values({
        appUserId: userId,
        bikemapRouteId,
        hammerheadRouteId: response.id,
        name: response.name,
        description,
        distance: response.distance,
        elevationGain: response.elevationGain,
        checksum: newChecksum,
      })
      .returning({ id: syncedRoutes.id });

    if (!created) throw new Error("Insert returned no row");

    return {
      routeId: created.id,
      hammerheadRouteId: response.id,
      action: "created",
      checksum: newChecksum,
      message: "Route created successfully on Hammerhead",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to create route on Hammerhead: ${msg}`);
  }
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
  const successful: SyncResult[] = [];
  const failed: Array<{ bikemapRouteId: string; error: string }> = [];

  for (const route of routes) {
    try {
      successful.push(
        await syncRoute(
          userId,
          route.bikemapRouteId,
          route.fileBuffer,
          route.filename,
          route.routeName,
          route.description,
        ),
      );
    } catch (err) {
      failed.push({
        bikemapRouteId: route.bikemapRouteId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { successful, failed };
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
  const sync = await findSyncedRoute(userId, bikemapRouteId);

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
  return db
    .select({
      id: syncedRoutes.id,
      bikemapRouteId: syncedRoutes.bikemapRouteId,
      hammerheadRouteId: syncedRoutes.hammerheadRouteId,
      checksum: syncedRoutes.checksum,
      lastSyncedAt: syncedRoutes.lastSyncedAt,
    })
    .from(syncedRoutes)
    .where(eq(syncedRoutes.appUserId, userId))
    .orderBy(desc(syncedRoutes.lastSyncedAt));
}

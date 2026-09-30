/**
 * Route sync service
 * Fetches routes from a provider and syncs them to Hammerhead
 * Handles create/update/skip decisions based on checksums
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "~/db/index";
import { syncedRoutes } from "~/db/schema";
import { getValidAccessToken } from "~/lib/tokenService";
import type { Deps } from "~/lib/deps";
import type { RouteSource } from "~/lib/providers/index";
import { computeChecksum } from "~/lib/checksumService";

export interface SyncResult {
  routeId: string;
  hammerheadRouteId: string;
  action: "created" | "updated" | "skipped";
  checksum: string;
  message: string;
}

async function findSyncedRoute(db: Db, userId: string, source: RouteSource) {
  const [row] = await db
    .select()
    .from(syncedRoutes)
    .where(
      and(
        eq(syncedRoutes.appUserId, userId),
        eq(syncedRoutes.provider, source.provider),
        eq(syncedRoutes.sourceRouteId, source.routeId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Sync a provider route to Hammerhead
 *
 * Logic:
 * 1. If route exists in SyncedRoute table with same checksum → SKIP
 * 2. If route exists in SyncedRoute table with different checksum → UPDATE
 * 3. If route doesn't exist in SyncedRoute table → CREATE
 *
 * @throws ProviderError if the provider can't deliver the route
 */
export async function syncRoute(
  deps: Deps,
  userId: string,
  source: RouteSource,
): Promise<SyncResult> {
  const { db, hammerhead, providers } = deps;

  const route = await providers[source.provider].fetchRoute(source.routeId);
  const newChecksum = computeChecksum(route.file);
  const existingSync = await findSyncedRoute(db, userId, source);

  if (existingSync && existingSync.checksum === newChecksum) {
    return {
      routeId: existingSync.id,
      hammerheadRouteId: existingSync.hammerheadRouteId,
      action: "skipped",
      checksum: newChecksum,
      message: "Route file unchanged; skipping sync",
    };
  }

  const accessToken = await getValidAccessToken(deps, userId);

  if (existingSync) {
    try {
      const response = await hammerhead.updateRoute(
        accessToken,
        existingSync.hammerheadRouteId,
        route.file,
        route.filename,
        route.name,
        route.description,
      );

      await db
        .update(syncedRoutes)
        .set({
          name: response.name,
          description: route.description ?? existingSync.description,
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
    const response = await hammerhead.createRoute(
      accessToken,
      route.file,
      route.filename,
      route.name,
      route.description,
    );

    const [created] = await db
      .insert(syncedRoutes)
      .values({
        appUserId: userId,
        provider: source.provider,
        sourceRouteId: source.routeId,
        hammerheadRouteId: response.id,
        name: response.name,
        description: route.description,
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
  deps: Deps,
  userId: string,
  sources: RouteSource[],
): Promise<{
  successful: SyncResult[];
  failed: Array<{ source: RouteSource; error: string }>;
}> {
  const successful: SyncResult[] = [];
  const failed: Array<{ source: RouteSource; error: string }> = [];

  for (const source of sources) {
    try {
      successful.push(await syncRoute(deps, userId, source));
    } catch (err) {
      failed.push({
        source,
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
  db: Db,
  userId: string,
  source: RouteSource,
): Promise<{
  isSynced: boolean;
  hammerheadRouteId?: string;
  checksum?: string;
  lastSyncedAt?: Date;
}> {
  const sync = await findSyncedRoute(db, userId, source);

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
export async function listSyncedRoutes(db: Db, userId: string) {
  return db
    .select({
      id: syncedRoutes.id,
      provider: syncedRoutes.provider,
      sourceRouteId: syncedRoutes.sourceRouteId,
      hammerheadRouteId: syncedRoutes.hammerheadRouteId,
      checksum: syncedRoutes.checksum,
      lastSyncedAt: syncedRoutes.lastSyncedAt,
    })
    .from(syncedRoutes)
    .where(eq(syncedRoutes.appUserId, userId))
    .orderBy(desc(syncedRoutes.lastSyncedAt));
}

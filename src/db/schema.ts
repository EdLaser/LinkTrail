import { doublePrecision, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { RouteProviderId } from "~/lib/providers/index";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Our own application's user (a person who syncs routes to their Hammerhead device)
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  ...timestamps,
});

// One Hammerhead OAuth connection per app user
export const hammerheadAccounts = pgTable("hammerhead_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  appUserId: uuid("app_user_id")
    .notNull()
    .unique()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  hammerheadUserId: text("hammerhead_user_id").notNull(),
  // AES-256-GCM encrypted
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

// Routes synced from a route provider (e.g. Bikemap) to Hammerhead
export const syncedRoutes = pgTable(
  "synced_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    provider: text("provider").$type<RouteProviderId>().notNull(),
    sourceRouteId: text("source_route_id").notNull(),
    hammerheadRouteId: text("hammerhead_route_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    distance: doublePrecision("distance").notNull(),
    elevationGain: doublePrecision("elevation_gain").notNull(),
    // SHA-256 of the uploaded file, used to detect changes
    checksum: text("checksum").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [unique().on(t.appUserId, t.provider, t.sourceRouteId)],
);

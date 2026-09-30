CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hammerhead_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"app_user_id" uuid NOT NULL UNIQUE,
	"hammerhead_user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"app_user_id" uuid NOT NULL,
	"bikemap_route_id" text NOT NULL,
	"hammerhead_route_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"distance" double precision NOT NULL,
	"elevation_gain" double precision NOT NULL,
	"checksum" text NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "synced_routes_app_user_id_bikemap_route_id_unique" UNIQUE("app_user_id","bikemap_route_id")
);
--> statement-breakpoint
ALTER TABLE "hammerhead_accounts" ADD CONSTRAINT "hammerhead_accounts_app_user_id_app_users_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "synced_routes" ADD CONSTRAINT "synced_routes_app_user_id_app_users_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE;
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"system_enabled" boolean DEFAULT true NOT NULL,
	"dialogue_enabled" boolean DEFAULT true NOT NULL,
	"quiet_start_hour" integer,
	"quiet_end_hour" integer,
	"daily_cap" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
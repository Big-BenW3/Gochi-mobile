CREATE TABLE "siws_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"payload" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_user_id" text,
	"wallet_address" text,
	"seeker_id" text,
	"genesis_verified" boolean DEFAULT false NOT NULL,
	"genesis_mint_address" text,
	"genesis_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "siws_nonces_expires_at_idx" ON "siws_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_privy_user_id_key" ON "users" USING btree ("privy_user_id");--> statement-breakpoint
CREATE INDEX "users_genesis_recheck_idx" ON "users" USING btree ("genesis_verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_links_active_key" ON "wallet_links" USING btree ("wallet_address") WHERE "wallet_links"."unlinked_at" is null;--> statement-breakpoint
CREATE INDEX "wallet_links_user_id_idx" ON "wallet_links" USING btree ("user_id");
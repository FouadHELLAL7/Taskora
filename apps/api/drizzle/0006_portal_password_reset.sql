ALTER TABLE "contacts" ADD COLUMN "portal_reset_token_hash" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "portal_reset_expires_at" timestamp with time zone;
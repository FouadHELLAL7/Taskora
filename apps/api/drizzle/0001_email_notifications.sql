ALTER TABLE "notifications" ADD COLUMN "email_status" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_email_idx" ON "notifications" USING btree ("email_status","created_at");
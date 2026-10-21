CREATE TABLE "logos" (
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"mime_type" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "logos_entity_uq" ON "logos" USING btree ("entity_type","entity_id");
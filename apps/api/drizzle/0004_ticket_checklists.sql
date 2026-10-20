CREATE TABLE "ticket_checklist_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_checklist_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" integer NOT NULL,
	"text" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"done_by_id" integer,
	"done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_checklist_items" ADD CONSTRAINT "ticket_checklist_items_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_items" ADD CONSTRAINT "ticket_checklist_items_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_checklist_ticket_idx" ON "ticket_checklist_items" USING btree ("ticket_id");
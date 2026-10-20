CREATE TABLE "recurring_tickets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recurring_tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"company_id" integer NOT NULL,
	"contact_id" integer,
	"configuration_item_id" integer,
	"title" text NOT NULL,
	"description" text,
	"queue_id" integer,
	"priority_id" integer,
	"ticket_type_id" integer,
	"issue_type_id" integer,
	"sub_issue_type_id" integer,
	"assigned_user_id" integer,
	"estimated_hours" numeric(10, 2),
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"due_in_hours" integer,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_ticket_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_configuration_item_id_configuration_items_id_fk" FOREIGN KEY ("configuration_item_id") REFERENCES "public"."configuration_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_issue_type_id_issue_types_id_fk" FOREIGN KEY ("issue_type_id") REFERENCES "public"."issue_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_sub_issue_type_id_sub_issue_types_id_fk" FOREIGN KEY ("sub_issue_type_id") REFERENCES "public"."sub_issue_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_tickets_next_idx" ON "recurring_tickets" USING btree ("is_active","next_run_at");
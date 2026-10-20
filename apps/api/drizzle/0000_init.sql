CREATE TABLE "attachments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attachments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text,
	"changes" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "billing_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billing_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'labor' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "billing_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_hours_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"schedule" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ci_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ci_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "custom_field_definitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"help_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "holidays_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"business_hours_id" integer NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issue_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"ticket_type_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_event_unique" UNIQUE("event")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"entity_type" text,
	"entity_id" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "queues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"email" text,
	"default_assignee_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "queues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"entity" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"csrf_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sla_policies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"business_hours_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_policies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sla_targets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sla_targets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sla_id" integer NOT NULL,
	"priority_id" integer NOT NULL,
	"first_response_minutes" integer,
	"resolution_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "sub_issue_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sub_issue_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"issue_type_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"queue_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_priorities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_priorities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_priorities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ticket_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ticket_statuses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_statuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"category" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"pauses_sla" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"title" text,
	"phone" text,
	"password_hash" text NOT NULL,
	"role_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_technician" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"hourly_cost" numeric(14, 2),
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"billing_code_id" integer,
	"hourly_rate" numeric(14, 2),
	"is_billable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "work_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"contact_id" integer,
	"user_id" integer,
	"type" text DEFAULT 'note' NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"account_number" text,
	"type" text DEFAULT 'customer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"industry" text,
	"website" text,
	"phone" text,
	"email" text,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"parent_company_id" integer,
	"primary_contact_id" integer,
	"account_manager_id" integer,
	"default_sla_id" integer,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"location_id" integer,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"title" text,
	"department" text,
	"email" text,
	"phone" text,
	"mobile" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "opportunities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"contact_id" integer,
	"owner_id" integer,
	"title" text NOT NULL,
	"stage" text DEFAULT 'qualification' NOT NULL,
	"amount" numeric(14, 2),
	"probability" integer DEFAULT 10 NOT NULL,
	"expected_close_date" date,
	"description" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "active_timers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "active_timers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"ticket_id" integer,
	"project_task_id" integer,
	"description" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "active_timers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ci_relations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ci_relations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ci_id" integer NOT NULL,
	"related_ci_id" integer NOT NULL,
	"type" text DEFAULT 'connected_to' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_software" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ci_software_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ci_id" integer NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"publisher" text,
	"license_key_ref" text,
	"installed_at" date,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuration_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "configuration_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ci_number" text NOT NULL,
	"name" text NOT NULL,
	"ci_type_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"contact_id" integer,
	"location_id" integer,
	"product_id" integer,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"asset_tag" text,
	"hostname" text,
	"os_name" text,
	"os_version" text,
	"ip_address" text,
	"mac_address" text,
	"cpu" text,
	"ram_gb" numeric(10, 2),
	"storage_gb" numeric(10, 2),
	"purchase_date" date,
	"purchase_cost" numeric(14, 2),
	"warranty_expires_at" date,
	"support_expires_at" date,
	"install_date" date,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuration_items_ci_number_unique" UNIQUE("ci_number")
);
--> statement-breakpoint
CREATE TABLE "contract_blocks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contract_id" integer NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"amount" numeric(14, 2),
	"start_date" date NOT NULL,
	"end_date" date,
	"is_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_rates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contract_id" integer NOT NULL,
	"work_type_id" integer NOT NULL,
	"hourly_rate" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_services" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contract_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"quantity" numeric(10, 2) DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contracts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contract_number" text NOT NULL,
	"name" text NOT NULL,
	"company_id" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"sla_id" integer,
	"contact_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"hourly_rate" numeric(14, 2),
	"fixed_amount" numeric(14, 2),
	"recurring_amount" numeric(14, 2),
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"overage_rate" numeric(14, 2),
	"description" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"ticket_id" integer,
	"project_id" integer,
	"contract_id" integer,
	"billing_code_id" integer,
	"expense_date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"invoice_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_id" integer NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"time_entry_id" integer,
	"expense_id" integer,
	"contract_service_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_number" text NOT NULL,
	"company_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"notes" text,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "kb_article_tickets" (
	"article_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_article_tickets_article_id_ticket_id_pk" PRIMARY KEY("article_id","ticket_id")
);
--> statement-breakpoint
CREATE TABLE "kb_articles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kb_articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"article_number" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"company_id" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" integer,
	"updated_by_id" integer,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_articles_article_number_unique" UNIQUE("article_number")
);
--> statement-breakpoint
CREATE TABLE "kb_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kb_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"parent_id" integer,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"sku" text,
	"manufacturer" text,
	"ci_type_id" integer,
	"description" text,
	"unit_cost" numeric(14, 2),
	"unit_price" numeric(14, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_milestones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"due_date" date,
	"description" text,
	"is_complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"milestone_id" integer,
	"title" text NOT NULL,
	"description" text,
	"assigned_user_id" integer,
	"status" text DEFAULT 'todo' NOT NULL,
	"estimated_hours" numeric(10, 2),
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_number" text NOT NULL,
	"name" text NOT NULL,
	"company_id" integer NOT NULL,
	"contract_id" integer,
	"manager_id" integer,
	"status" text DEFAULT 'planning' NOT NULL,
	"start_date" date,
	"end_date" date,
	"estimated_hours" numeric(10, 2),
	"budget" numeric(14, 2),
	"description" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_project_number_unique" UNIQUE("project_number")
);
--> statement-breakpoint
CREATE TABLE "service_call_tickets" (
	"service_call_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	CONSTRAINT "service_call_tickets_service_call_id_ticket_id_pk" PRIMARY KEY("service_call_id","ticket_id")
);
--> statement-breakpoint
CREATE TABLE "service_call_users" (
	"service_call_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "service_call_users_service_call_id_user_id_pk" PRIMARY KEY("service_call_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "service_calls" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "service_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"company_id" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"unit_price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"unit_cost" numeric(14, 2),
	"period" text DEFAULT 'monthly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" integer NOT NULL,
	"user_id" integer,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" integer NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_relations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_relations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_id" integer NOT NULL,
	"related_ticket_id" integer NOT NULL,
	"type" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"queue_id" integer,
	"ticket_type_id" integer,
	"issue_type_id" integer,
	"sub_issue_type_id" integer,
	"priority_id" integer,
	"source_id" integer,
	"estimated_hours" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ticket_watchers" (
	"ticket_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_watchers_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticket_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"company_id" integer NOT NULL,
	"contact_id" integer,
	"location_id" integer,
	"configuration_item_id" integer,
	"assigned_user_id" integer,
	"queue_id" integer,
	"ticket_type_id" integer,
	"issue_type_id" integer,
	"sub_issue_type_id" integer,
	"status_id" integer NOT NULL,
	"priority_id" integer NOT NULL,
	"source_id" integer,
	"sla_id" integer,
	"contract_id" integer,
	"project_id" integer,
	"due_at" timestamp with time zone,
	"estimated_hours" numeric(10, 2),
	"resolution" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_response_at" timestamp with time zone,
	"first_response_due_at" timestamp with time zone,
	"resolution_due_at" timestamp with time zone,
	"sla_paused_at" timestamp with time zone,
	"sla_paused_minutes" integer DEFAULT 0 NOT NULL,
	"first_response_breached" boolean DEFAULT false NOT NULL,
	"resolution_breached" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "time_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"ticket_id" integer,
	"project_task_id" integer,
	"company_id" integer NOT NULL,
	"project_id" integer,
	"contract_id" integer,
	"work_type_id" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"contract_covered" boolean DEFAULT false NOT NULL,
	"hourly_rate" numeric(14, 2),
	"description" text NOT NULL,
	"internal_notes" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"approved_by_id" integer,
	"approved_at" timestamp with time zone,
	"invoice_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_executions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_id" integer NOT NULL,
	"ticket_id" integer,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"dedupe_key" text,
	"result" jsonb,
	"error" text,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"trigger" text NOT NULL,
	"delay_minutes" integer,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"stop_processing" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"last_executed_at" timestamp with time zone,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action1_endpoints" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "action1_endpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"external_id" text NOT NULL,
	"org_external_id" text NOT NULL,
	"configuration_item_id" integer,
	"contact_id" integer,
	"name" text,
	"device_name" text,
	"os_name" text,
	"platform" text,
	"serial_number" text,
	"manufacturer" text,
	"ip_address" text,
	"mac_address" text,
	"logged_in_user" text,
	"agent_status" text,
	"online_status" text,
	"last_seen_at" timestamp with time zone,
	"last_boot_at" timestamp with time zone,
	"reboot_required" boolean,
	"update_status" text,
	"vulnerability_status" text,
	"missing_critical_updates" integer,
	"missing_other_updates" integer,
	"agent_version" text,
	"cpu" text,
	"ram_text" text,
	"disk_text" text,
	"missing_updates" jsonb,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"match_note" text,
	"contact_match_note" text,
	"missing_since" timestamp with time zone,
	"previous_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action1_endpoints_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "action1_organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "action1_organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"company_id" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"endpoint_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action1_organizations_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_encrypted" text,
	"status" text DEFAULT 'not_configured' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"next_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"triggered_by_id" integer
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_business_hours_id_business_hours_id_fk" FOREIGN KEY ("business_hours_id") REFERENCES "public"."business_hours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_types" ADD CONSTRAINT "issue_types_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_default_assignee_id_users_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_business_hours_id_business_hours_id_fk" FOREIGN KEY ("business_hours_id") REFERENCES "public"."business_hours"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_sla_id_sla_policies_id_fk" FOREIGN KEY ("sla_id") REFERENCES "public"."sla_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_issue_types" ADD CONSTRAINT "sub_issue_types_issue_type_id_issue_types_id_fk" FOREIGN KEY ("issue_type_id") REFERENCES "public"."issue_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_issue_types" ADD CONSTRAINT "sub_issue_types_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_billing_code_id_billing_codes_id_fk" FOREIGN KEY ("billing_code_id") REFERENCES "public"."billing_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_companies_id_fk" FOREIGN KEY ("parent_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_account_manager_id_users_id_fk" FOREIGN KEY ("account_manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_sla_id_sla_policies_id_fk" FOREIGN KEY ("default_sla_id") REFERENCES "public"."sla_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_project_task_id_project_tasks_id_fk" FOREIGN KEY ("project_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_relations" ADD CONSTRAINT "ci_relations_ci_id_configuration_items_id_fk" FOREIGN KEY ("ci_id") REFERENCES "public"."configuration_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_relations" ADD CONSTRAINT "ci_relations_related_ci_id_configuration_items_id_fk" FOREIGN KEY ("related_ci_id") REFERENCES "public"."configuration_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_software" ADD CONSTRAINT "ci_software_ci_id_configuration_items_id_fk" FOREIGN KEY ("ci_id") REFERENCES "public"."configuration_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_ci_type_id_ci_types_id_fk" FOREIGN KEY ("ci_type_id") REFERENCES "public"."ci_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_blocks" ADD CONSTRAINT "contract_blocks_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_rates" ADD CONSTRAINT "contract_rates_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_rates" ADD CONSTRAINT "contract_rates_work_type_id_work_types_id_fk" FOREIGN KEY ("work_type_id") REFERENCES "public"."work_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sla_id_sla_policies_id_fk" FOREIGN KEY ("sla_id") REFERENCES "public"."sla_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_billing_code_id_billing_codes_id_fk" FOREIGN KEY ("billing_code_id") REFERENCES "public"."billing_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_contract_service_id_contract_services_id_fk" FOREIGN KEY ("contract_service_id") REFERENCES "public"."contract_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article_tickets" ADD CONSTRAINT "kb_article_tickets_article_id_kb_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."kb_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article_tickets" ADD CONSTRAINT "kb_article_tickets_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_category_id_kb_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."kb_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_parent_id_kb_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kb_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_ci_type_id_ci_types_id_fk" FOREIGN KEY ("ci_type_id") REFERENCES "public"."ci_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call_tickets" ADD CONSTRAINT "service_call_tickets_service_call_id_service_calls_id_fk" FOREIGN KEY ("service_call_id") REFERENCES "public"."service_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call_tickets" ADD CONSTRAINT "service_call_tickets_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call_users" ADD CONSTRAINT "service_call_users_service_call_id_service_calls_id_fk" FOREIGN KEY ("service_call_id") REFERENCES "public"."service_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call_users" ADD CONSTRAINT "service_call_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_calls" ADD CONSTRAINT "service_calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_calls" ADD CONSTRAINT "service_calls_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_related_ticket_id_tickets_id_fk" FOREIGN KEY ("related_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_issue_type_id_issue_types_id_fk" FOREIGN KEY ("issue_type_id") REFERENCES "public"."issue_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_sub_issue_type_id_sub_issue_types_id_fk" FOREIGN KEY ("sub_issue_type_id") REFERENCES "public"."sub_issue_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_source_id_ticket_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ticket_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_configuration_item_id_configuration_items_id_fk" FOREIGN KEY ("configuration_item_id") REFERENCES "public"."configuration_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_issue_type_id_issue_types_id_fk" FOREIGN KEY ("issue_type_id") REFERENCES "public"."issue_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sub_issue_type_id_sub_issue_types_id_fk" FOREIGN KEY ("sub_issue_type_id") REFERENCES "public"."sub_issue_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_source_id_ticket_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ticket_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_id_sla_policies_id_fk" FOREIGN KEY ("sla_id") REFERENCES "public"."sla_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_task_id_project_tasks_id_fk" FOREIGN KEY ("project_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_work_type_id_work_types_id_fk" FOREIGN KEY ("work_type_id") REFERENCES "public"."work_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_rule_id_workflow_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action1_endpoints" ADD CONSTRAINT "action1_endpoints_configuration_item_id_configuration_items_id_fk" FOREIGN KEY ("configuration_item_id") REFERENCES "public"."configuration_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action1_endpoints" ADD CONSTRAINT "action1_endpoints_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action1_organizations" ADD CONSTRAINT "action1_organizations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_triggered_by_id_users_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "cfd_entity_key_uq" ON "custom_field_definitions" USING btree ("entity","key");--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_bh_date_uq" ON "holidays" USING btree ("business_hours_id","date");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_uq" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."status" in ('pending','running');--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_targets_uq" ON "sla_targets" USING btree ("sla_id","priority_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "activities_company_idx" ON "activities" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_account_number_uq" ON "companies" USING btree ("account_number") WHERE "companies"."account_number" is not null;--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "locations_company_idx" ON "locations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "opportunities_company_idx" ON "opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_relations_uq" ON "ci_relations" USING btree ("ci_id","related_ci_id","type");--> statement-breakpoint
CREATE INDEX "ci_software_ci_idx" ON "ci_software" USING btree ("ci_id");--> statement-breakpoint
CREATE INDEX "ci_company_idx" ON "configuration_items" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ci_contact_idx" ON "configuration_items" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ci_serial_idx" ON "configuration_items" USING btree (lower("serial_number"));--> statement-breakpoint
CREATE INDEX "ci_hostname_idx" ON "configuration_items" USING btree (lower("hostname"));--> statement-breakpoint
CREATE UNIQUE INDEX "contract_rates_uq" ON "contract_rates" USING btree ("contract_id","work_type_id");--> statement-breakpoint
CREATE INDEX "contracts_company_idx" ON "contracts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "expenses_company_idx" ON "expenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_company_idx" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "kb_articles_company_idx" ON "kb_articles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_user_idx" ON "project_tasks" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "projects_company_idx" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "service_calls_start_idx" ON "service_calls" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_notes_ticket_idx" ON "ticket_notes" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_relations_uq" ON "ticket_relations" USING btree ("ticket_id","related_ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_company_idx" ON "tickets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tickets_contact_idx" ON "tickets" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "tickets_ci_idx" ON "tickets" USING btree ("configuration_item_id");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "tickets_queue_idx" ON "tickets" USING btree ("queue_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "tickets_created_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "time_entries_user_idx" ON "time_entries" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "time_entries_ticket_idx" ON "time_entries" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "time_entries_company_idx" ON "time_entries" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE INDEX "time_entries_contract_idx" ON "time_entries" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "wf_exec_rule_idx" ON "workflow_executions" USING btree ("rule_id","executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wf_exec_dedupe_uq" ON "workflow_executions" USING btree ("rule_id","dedupe_key") WHERE "workflow_executions"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "a1_endpoints_org_idx" ON "action1_endpoints" USING btree ("org_external_id");--> statement-breakpoint
CREATE INDEX "a1_endpoints_ci_idx" ON "action1_endpoints" USING btree ("configuration_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "a1_endpoints_ci_uq" ON "action1_endpoints" USING btree ("configuration_item_id") WHERE "action1_endpoints"."configuration_item_id" is not null;--> statement-breakpoint
CREATE INDEX "sync_runs_provider_idx" ON "sync_runs" USING btree ("provider","started_at");
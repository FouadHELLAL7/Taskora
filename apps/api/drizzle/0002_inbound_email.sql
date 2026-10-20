CREATE TABLE "inbound_emails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inbound_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"message_id" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text,
	"status" text NOT NULL,
	"ticket_id" integer,
	"detail" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX "inbound_emails_received_idx" ON "inbound_emails" USING btree ("received_at");
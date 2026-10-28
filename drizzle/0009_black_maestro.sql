CREATE TYPE "public"."email_kind" AS ENUM('registration_received', 'payment_instructions', 'accreditation_ready', 'settlement_reminder');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" "email_kind" NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"to_email" text NOT NULL,
	"registration_id" uuid,
	"credential_id" uuid,
	"settlement_reminder_id" uuid,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "email_outbox_attempts_nonnegative" CHECK ("email_outbox"."attempt_count" >= 0),
	CONSTRAINT "email_outbox_one_subject" CHECK ((
    ("email_outbox"."registration_id" IS NOT NULL)::integer +
    ("email_outbox"."settlement_reminder_id" IS NOT NULL)::integer = 1
  ))
);
--> statement-breakpoint
ALTER TABLE "accreditation_credentials" ADD COLUMN "token_ciphertext" text NOT NULL;--> statement-breakpoint
ALTER TABLE "accreditation_credentials" ADD COLUMN "token_iv" text NOT NULL;--> statement-breakpoint
ALTER TABLE "accreditation_credentials" ADD COLUMN "token_auth_tag" text NOT NULL;--> statement-breakpoint
ALTER TABLE "accreditation_credentials" ADD COLUMN "encryption_key_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_credential_id_accreditation_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."accreditation_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_settlement_reminder_id_settlement_reminders_id_fk" FOREIGN KEY ("settlement_reminder_id") REFERENCES "public"."settlement_reminders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_ready" ON "email_outbox" USING btree ("status","next_attempt_at");
CREATE TYPE "public"."accreditation_delivery" AS ENUM('screen', 'download', 'print', 'email');--> statement-breakpoint
CREATE TYPE "public"."accreditation_reason" AS ENUM('paid', 'assistance_approved');--> statement-breakpoint
CREATE TYPE "public"."admission_scan_result" AS ENUM('admitted', 'already_admitted', 'not_eligible', 'revoked', 'expired', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."assistance_status" AS ENUM('requested', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."ecclesial_state" AS ENUM('laico', 'religioso', 'seminarista', 'diacono', 'postulante-novicia', 'presbitero', 'otro');--> statement-breakpoint
ALTER TYPE "public"."admin_role" ADD VALUE 'admission_operator';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'partially_refunded';--> statement-breakpoint
CREATE TABLE "accreditation_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"token_hash" text NOT NULL,
	"reason" "accreditation_reason" NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revocation_reason" text,
	CONSTRAINT "accreditation_credentials_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "accreditation_token_hash_length" CHECK (length("accreditation_credentials"."token_hash") = 64),
	CONSTRAINT "accreditation_version_positive" CHECK ("accreditation_credentials"."version" > 0),
	CONSTRAINT "accreditation_expiry_after_issue" CHECK ("accreditation_credentials"."expires_at" > "accreditation_credentials"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "accreditation_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credential_id" uuid NOT NULL,
	"channel" "accreditation_delivery" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credential_id" uuid,
	"scanned_by" uuid NOT NULL,
	"result" "admission_scan_result" NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_point" text
);
--> statement-breakpoint
CREATE TABLE "assistance_requests" (
	"registration_id" uuid PRIMARY KEY NOT NULL,
	"status" "assistance_status" DEFAULT 'requested' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistance_review_consistent" CHECK (("assistance_requests"."status" = 'requested' AND "assistance_requests"."reviewed_at" IS NULL AND "assistance_requests"."reviewed_by" IS NULL) OR ("assistance_requests"."status" <> 'requested' AND "assistance_requests"."reviewed_at" IS NOT NULL AND "assistance_requests"."reviewed_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"scanned_by" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_point" text,
	CONSTRAINT "check_ins_registration_id_unique" UNIQUE("registration_id")
);
--> statement-breakpoint
CREATE TABLE "payment_chargebacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"provider_chargeback_id" text NOT NULL,
	"provider_payment_id" text,
	"provider_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_chargebacks_provider_chargeback_id_unique" UNIQUE("provider_chargeback_id")
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"provider_refund_id" text NOT NULL,
	"provider_payment_id" text,
	"amount_minor" integer NOT NULL,
	"provider_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_provider_refund_id_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "payment_refunds_amount_positive" CHECK ("payment_refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_status" text NOT NULL,
	"provider_status_detail" text,
	"amount_minor" integer NOT NULL,
	"paid_amount_minor" integer DEFAULT 0 NOT NULL,
	"payment_method_type" text,
	"payment_method_id" text,
	"installments" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payment_transactions_amount_positive" CHECK ("payment_transactions"."amount_minor" > 0),
	CONSTRAINT "payment_transactions_paid_nonnegative" CHECK ("payment_transactions"."paid_amount_minor" >= 0),
	CONSTRAINT "payment_transactions_installments_positive" CHECK ("payment_transactions"."installments" IS NULL OR "payment_transactions"."installments" > 0)
);
--> statement-breakpoint
CREATE TABLE "registration_intakes" (
	"registration_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"prayer_group" text,
	"movement" text,
	"ecclesial_state" "ecclesial_state" NOT NULL,
	"occupation" text,
	"payment_difficulty" boolean NOT NULL,
	"payment_difficulty_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_first_name_present" CHECK (length(trim("registration_intakes"."first_name")) > 0),
	CONSTRAINT "intake_last_name_present" CHECK (length(trim("registration_intakes"."last_name")) > 0),
	CONSTRAINT "intake_difficulty_notes_only_if_requested" CHECK ("registration_intakes"."payment_difficulty" OR "registration_intakes"."payment_difficulty_notes" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "external_reference" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "paid_amount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_status_detail" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_user_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_application_id" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_live_mode" boolean;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "seller_user_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "live_mode" boolean;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "last_tried_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accreditation_credentials" ADD CONSTRAINT "accreditation_credentials_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accreditation_credentials" ADD CONSTRAINT "accreditation_credentials_revoked_by_admin_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accreditation_deliveries" ADD CONSTRAINT "accreditation_deliveries_credential_id_accreditation_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."accreditation_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_scans" ADD CONSTRAINT "admission_scans_credential_id_accreditation_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."accreditation_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_scans" ADD CONSTRAINT "admission_scans_scanned_by_admin_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_requests" ADD CONSTRAINT "assistance_requests_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_requests" ADD CONSTRAINT "assistance_requests_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_credential_id_accreditation_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."accreditation_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_scanned_by_admin_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_chargebacks" ADD CONSTRAINT "payment_chargebacks_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_intakes" ADD CONSTRAINT "registration_intakes_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accreditation_registration_version_unique" ON "accreditation_credentials" USING btree ("registration_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "accreditation_one_active_per_registration" ON "accreditation_credentials" USING btree ("registration_id") WHERE "accreditation_credentials"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "accreditation_by_registration" ON "accreditation_credentials" USING btree ("registration_id","issued_at");--> statement-breakpoint
CREATE INDEX "accreditation_deliveries_by_credential" ON "accreditation_deliveries" USING btree ("credential_id","created_at");--> statement-breakpoint
CREATE INDEX "admission_scans_by_time" ON "admission_scans" USING btree ("scanned_at");--> statement-breakpoint
CREATE INDEX "assistance_by_status" ON "assistance_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "check_ins_by_time" ON "check_ins" USING btree ("scanned_at");--> statement-breakpoint
CREATE INDEX "chargebacks_by_attempt" ON "payment_chargebacks" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "refunds_by_attempt" ON "payment_refunds" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "transactions_by_attempt" ON "payment_transactions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "webhooks_by_resource" ON "webhook_events" USING btree ("resource_id","received_at");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_external_reference_unique" UNIQUE("external_reference");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paid_nonnegative" CHECK ("payment_attempts"."paid_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_retry_nonnegative" CHECK ("webhook_events"."retry_count" >= 0);
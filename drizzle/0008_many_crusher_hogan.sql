ALTER TYPE "public"."payment_source" ADD VALUE 'bank_transfer';--> statement-breakpoint
ALTER TYPE "public"."payment_source" ADD VALUE 'on_site';--> statement-breakpoint
CREATE TABLE "settlement_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"release_days" integer NOT NULL,
	"fee_basis_points" integer,
	"fee_includes_tax" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_release_days_range" CHECK ("settlement_options"."release_days" BETWEEN 0 AND 120),
	CONSTRAINT "settlement_fee_range" CHECK ("settlement_options"."fee_basis_points" IS NULL OR "settlement_options"."fee_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "settlement_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"recommended_release_days" integer NOT NULL,
	"switch_at" timestamp with time zone NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"target_available_at" timestamp with time zone NOT NULL,
	"email_to" text NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_payment_settings" (
	"workshop_id" uuid PRIMARY KEY NOT NULL,
	"mercado_pago_enabled" boolean DEFAULT false NOT NULL,
	"transfer_enabled" boolean DEFAULT true NOT NULL,
	"on_site_enabled" boolean DEFAULT true NOT NULL,
	"transfer_alias" text,
	"transfer_provider" text,
	"proof_whatsapp_e164" text,
	"funds_needed_days_before" integer DEFAULT 3 NOT NULL,
	"reminder_email" text,
	"reminder_lead_days" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funds_needed_days_range" CHECK ("workshop_payment_settings"."funds_needed_days_before" BETWEEN 1 AND 90),
	CONSTRAINT "reminder_lead_days_range" CHECK ("workshop_payment_settings"."reminder_lead_days" BETWEEN 0 AND 30)
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "approved_manual_evidence";--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "proof_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "proof_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "proof_review_note" text;--> statement-breakpoint
ALTER TABLE "settlement_options" ADD CONSTRAINT "settlement_options_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_reminders" ADD CONSTRAINT "settlement_reminders_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_reminders" ADD CONSTRAINT "settlement_reminders_acknowledged_by_admin_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_payment_settings" ADD CONSTRAINT "workshop_payment_settings_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_workshop_release_days_unique" ON "settlement_options" USING btree ("workshop_id","release_days");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_reminder_switch_unique" ON "settlement_reminders" USING btree ("workshop_id","switch_at");--> statement-breakpoint
CREATE INDEX "settlement_reminders_due" ON "settlement_reminders" USING btree ("acknowledged_at","remind_at");--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "approved_manual_evidence" CHECK ("payment_attempts"."source" = 'mercado_pago' OR "payment_attempts"."status" <> 'approved' OR (
    "payment_attempts"."manual_verified_by" IS NOT NULL AND "payment_attempts"."manual_verified_at" IS NOT NULL
    AND "payment_attempts"."paid_amount_minor" >= "payment_attempts"."amount_minor"
  ));
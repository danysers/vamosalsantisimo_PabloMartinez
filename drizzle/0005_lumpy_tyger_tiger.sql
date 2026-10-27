ALTER TABLE "payment_attempts" ADD COLUMN "manual_verified_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "manual_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "manual_reference" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_manual_verified_by_admin_users_id_fk" FOREIGN KEY ("manual_verified_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "approved_mp_evidence" CHECK ("payment_attempts"."source" <> 'mercado_pago' OR "payment_attempts"."status" <> 'approved' OR (
    "payment_attempts"."provider_order_id" IS NOT NULL AND "payment_attempts"."external_reference" IS NOT NULL
    AND "payment_attempts"."provider_status" IS NOT NULL AND "payment_attempts"."provider_status_detail" IS NOT NULL
    AND "payment_attempts"."provider_status" = 'processed' AND "payment_attempts"."provider_status_detail" = 'accredited'
    AND "payment_attempts"."provider_user_id" IS NOT NULL AND "payment_attempts"."provider_application_id" IS NOT NULL
    AND "payment_attempts"."provider_live_mode" IS NOT NULL
    AND "payment_attempts"."reconciled_at" IS NOT NULL AND "payment_attempts"."paid_amount_minor" >= "payment_attempts"."amount_minor"
  ));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "approved_manual_evidence" CHECK ("payment_attempts"."source" <> 'manual' OR "payment_attempts"."status" <> 'approved' OR (
    "payment_attempts"."manual_verified_by" IS NOT NULL AND "payment_attempts"."manual_verified_at" IS NOT NULL
    AND "payment_attempts"."paid_amount_minor" >= "payment_attempts"."amount_minor"
  ));
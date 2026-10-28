ALTER TYPE "public"."email_kind" ADD VALUE 'registration_access';--> statement-breakpoint
CREATE TABLE "registration_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"code_encrypted" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_attempts_range" CHECK ("registration_recoveries"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "recovery_id" uuid;--> statement-breakpoint
ALTER TABLE "registration_intakes" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "registration_intakes" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "registration_intakes" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "registration_recoveries" ADD CONSTRAINT "registration_recoveries_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recoveries_by_registration" ON "registration_recoveries" USING btree ("registration_id","created_at");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recovery_id_registration_recoveries_id_fk" FOREIGN KEY ("recovery_id") REFERENCES "public"."registration_recoveries"("id") ON DELETE no action ON UPDATE no action;
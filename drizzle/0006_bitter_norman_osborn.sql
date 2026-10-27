CREATE TYPE "public"."promotion_kind" AS ENUM('bundle', 'group_fixed');--> statement-breakpoint
ALTER TYPE "public"."accreditation_reason" ADD VALUE 'waived';--> statement-breakpoint
CREATE TABLE "fee_waivers" (
	"registration_id" uuid PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"note" text,
	CONSTRAINT "fee_waivers_reason_present" CHECK (length(trim("fee_waivers"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"lot_number" integer NOT NULL,
	"promotion_id" uuid,
	"promotion_code" text,
	"base_amount_minor" integer NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"due_amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_lot_number_range" CHECK ("payment_allocations"."lot_number" BETWEEN 1 AND 3),
	CONSTRAINT "allocations_base_positive" CHECK ("payment_allocations"."base_amount_minor" > 0),
	CONSTRAINT "allocations_discount_range" CHECK ("payment_allocations"."discount_minor" >= 0 AND "payment_allocations"."discount_minor" <= "payment_allocations"."base_amount_minor"),
	CONSTRAINT "allocations_balance" CHECK ("payment_allocations"."due_amount_minor" = "payment_allocations"."base_amount_minor" - "payment_allocations"."discount_minor")
);
--> statement-breakpoint
CREATE TABLE "workshop_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" "promotion_kind" NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"bundle_size" integer,
	"payable_people" integer,
	"min_people" integer,
	"max_people" integer,
	"group_total_minor" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_valid_window" CHECK ("workshop_promotions"."starts_at" IS NULL OR "workshop_promotions"."ends_at" IS NULL OR "workshop_promotions"."starts_at" < "workshop_promotions"."ends_at"),
	CONSTRAINT "promotion_valid_shape" CHECK ((
    "workshop_promotions"."kind" = 'bundle' AND "workshop_promotions"."bundle_size" IS NOT NULL AND "workshop_promotions"."payable_people" IS NOT NULL
      AND "workshop_promotions"."bundle_size" >= 2 AND "workshop_promotions"."payable_people" >= 1
      AND "workshop_promotions"."payable_people" < "workshop_promotions"."bundle_size"
      AND "workshop_promotions"."min_people" IS NULL AND "workshop_promotions"."max_people" IS NULL AND "workshop_promotions"."group_total_minor" IS NULL
  ) OR (
    "workshop_promotions"."kind" = 'group_fixed' AND "workshop_promotions"."bundle_size" IS NULL AND "workshop_promotions"."payable_people" IS NULL
      AND "workshop_promotions"."min_people" IS NOT NULL AND "workshop_promotions"."max_people" IS NOT NULL AND "workshop_promotions"."group_total_minor" IS NOT NULL
      AND "workshop_promotions"."min_people" >= 2 AND "workshop_promotions"."max_people" >= "workshop_promotions"."min_people"
      AND "workshop_promotions"."group_total_minor" > 0
  ))
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "payer_email" text;--> statement-breakpoint
ALTER TABLE "workshop_lots" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_revoked_by_admin_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_lot_id_workshop_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."workshop_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_promotion_id_workshop_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."workshop_promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_promotions" ADD CONSTRAINT "workshop_promotions_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_attempt_registration_unique" ON "payment_allocations" USING btree ("attempt_id","registration_id");--> statement-breakpoint
CREATE INDEX "allocations_by_registration" ON "payment_allocations" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_workshop_code_unique" ON "workshop_promotions" USING btree ("workshop_id","code");

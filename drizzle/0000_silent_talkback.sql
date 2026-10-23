CREATE TYPE "public"."admin_role" AS ENUM('configuration', 'registration_operator');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('mercado_pago', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'review');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending', 'waiting', 'confirmed', 'cancelled', 'review');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'expired', 'released', 'used');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject_id" uuid,
	"reason" text,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid,
	"status" text DEFAULT 'ready' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"provider_order_id" text,
	"idempotency_key" uuid NOT NULL,
	"source" "payment_source" NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_attempts_amount_positive" CHECK ("payment_attempts"."amount_minor" > 0),
	CONSTRAINT "payment_attempts_ars" CHECK ("payment_attempts"."currency" = 'ARS')
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"phone" text NOT NULL,
	"normalized_phone" text NOT NULL,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_reference_unique" UNIQUE("reference"),
	CONSTRAINT "registrations_access_token_hash_unique" UNIQUE("access_token_hash")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"status" "reservation_status" DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "webhook_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "workshop_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	CONSTRAINT "workshop_lots_number_range" CHECK ("workshop_lots"."number" BETWEEN 1 AND 3),
	CONSTRAINT "workshop_lots_amount_positive" CHECK ("workshop_lots"."amount_minor" > 0),
	CONSTRAINT "workshop_lots_ars" CHECK ("workshop_lots"."currency" = 'ARS')
);
--> statement-breakpoint
CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue" text,
	"capacity" integer,
	"active_lot" integer DEFAULT 1 NOT NULL,
	"registration_open" boolean DEFAULT false NOT NULL,
	"waitlist_enabled" boolean DEFAULT false NOT NULL,
	"reservation_minutes" integer DEFAULT 30 NOT NULL,
	CONSTRAINT "workshops_capacity_positive" CHECK ("workshops"."capacity" IS NULL OR "workshops"."capacity" > 0),
	CONSTRAINT "workshops_lot_range" CHECK ("workshops"."active_lot" BETWEEN 1 AND 3),
	CONSTRAINT "workshops_reservation_minutes_positive" CHECK ("workshops"."reservation_minutes" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_lots" ADD CONSTRAINT "workshop_lots_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_by_time" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_ready" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "attempts_by_registration" ON "payment_attempts" USING btree ("registration_id","created_at");--> statement-breakpoint
CREATE INDEX "registrations_by_workshop_created" ON "registrations" USING btree ("workshop_id","created_at");--> statement-breakpoint
CREATE INDEX "registrations_by_email_name" ON "registrations" USING btree ("workshop_id","normalized_email","normalized_name");--> statement-breakpoint
CREATE INDEX "registrations_by_phone_name" ON "registrations" USING btree ("workshop_id","normalized_phone","normalized_name");--> statement-breakpoint
CREATE INDEX "reservations_by_registration" ON "reservations" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "reservations_by_status_expiry" ON "reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "webhooks_pending" ON "webhook_events" USING btree ("processed_at","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_lots_number_unique" ON "workshop_lots" USING btree ("workshop_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "workshops_event_unique" ON "workshops" USING btree ("event_id");
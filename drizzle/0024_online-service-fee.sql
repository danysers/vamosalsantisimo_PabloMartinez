ALTER TABLE "workshop_payment_settings" ADD COLUMN "online_service_fee_minor" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_payment_settings" ADD CONSTRAINT "online_service_fee_range" CHECK ("workshop_payment_settings"."online_service_fee_minor" BETWEEN 0 AND 20000000);

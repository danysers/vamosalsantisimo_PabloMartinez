ALTER TABLE "payment_proofs" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "drive_file_name" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "drive_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "drive_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "drive_next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "drive_last_error" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_drive_file_id_unique" UNIQUE("drive_file_id");--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_document_format" CHECK ("payment_proofs"."document_number" IS NULL OR "payment_proofs"."document_number" ~ '^[A-Z0-9-]{5,20}$');--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_drive_attempts_nonnegative" CHECK ("payment_proofs"."drive_attempt_count" >= 0);
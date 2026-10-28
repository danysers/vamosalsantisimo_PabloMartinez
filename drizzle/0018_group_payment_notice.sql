ALTER TYPE "public"."email_kind" ADD VALUE 'group_payment_notice';--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "group_request_hash" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "group_request_hash_length"
  CHECK ("group_request_hash" IS NULL OR length("group_request_hash") = 64);--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "payment_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_payment_attempt_id_payment_attempts_id_fk"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_by_attempt" ON "email_outbox" ("payment_attempt_id") WHERE "payment_attempt_id" IS NOT NULL;

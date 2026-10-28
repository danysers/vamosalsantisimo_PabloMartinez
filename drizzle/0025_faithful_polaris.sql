ALTER TYPE "public"."email_kind" ADD VALUE 'payment_proof_submitted';--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proofs_size_limit" CHECK ("payment_proofs"."size_bytes" BETWEEN 1 AND 5242880),
	CONSTRAINT "payment_proofs_sha256_length" CHECK (length("payment_proofs"."sha256") = 64)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "payment_proof_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_proofs_by_attempt" ON "payment_proofs" USING btree ("payment_attempt_id","uploaded_at");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_payment_proof_id_payment_proofs_id_fk" FOREIGN KEY ("payment_proof_id") REFERENCES "public"."payment_proofs"("id") ON DELETE no action ON UPDATE no action;
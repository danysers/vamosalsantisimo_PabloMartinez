ALTER TABLE "registration_intakes" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "registration_intakes" ADD CONSTRAINT "intake_document_format" CHECK ("registration_intakes"."document_number" IS NULL OR "registration_intakes"."document_number" ~ '^[A-Z0-9-]{5,20}$');--> statement-breakpoint
UPDATE registration_intakes i SET document_number = previous.document_number
FROM (
  SELECT DISTINCT ON (registration_id) registration_id, document_number
  FROM payment_proofs WHERE document_number IS NOT NULL
  ORDER BY registration_id, uploaded_at DESC
) previous
WHERE i.registration_id = previous.registration_id AND i.document_number IS NULL;

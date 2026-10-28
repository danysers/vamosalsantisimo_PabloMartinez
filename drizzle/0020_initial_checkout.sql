ALTER TABLE "payment_attempts" ADD COLUMN "provider_fee_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "checkout_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE payment_attempts ADD CONSTRAINT payment_provider_fee_valid
  CHECK (provider_fee_minor >= 0 AND provider_fee_minor < amount_minor AND (source='mercado_pago' OR provider_fee_minor=0));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION verify_payment_quote_before_processing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total_due bigint;
DECLARE members integer;
BEGIN
  IF OLD.status='created' AND NEW.status<>'created' THEN
    SELECT coalesce(sum(due_amount_minor),0),count(*) INTO total_due,members FROM payment_allocations WHERE attempt_id=NEW.id;
    IF members>0 AND total_due+NEW.provider_fee_minor<>NEW.amount_minor THEN
      RAISE EXCEPTION 'payment allocations do not match charge amount';
    END IF;
    IF NEW.source='mercado_pago' AND members=0 THEN RAISE EXCEPTION 'Mercado Pago payment requires priced members'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_payment_quote_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.registration_id IS DISTINCT FROM OLD.registration_id OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.provider_fee_minor IS DISTINCT FROM OLD.provider_fee_minor
     OR (OLD.external_reference IS NOT NULL AND NEW.external_reference IS DISTINCT FROM OLD.external_reference)
     OR (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id) THEN
    RAISE EXCEPTION 'payment quote is immutable';
  END IF;
  RETURN NEW;
END $$;

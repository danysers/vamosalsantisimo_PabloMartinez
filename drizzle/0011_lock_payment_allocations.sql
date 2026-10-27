-- Custom SQL migration file, put your code below! --
-- Price/member snapshots are immutable after insertion. Changes require a new
-- attempt rather than rewriting a historical charge or a 3x2/2x1 allocation.
CREATE FUNCTION prevent_payment_allocation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment allocation snapshot is immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_allocation_no_update_delete
BEFORE UPDATE OR DELETE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_payment_allocation_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_payment_quote_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.registration_id IS DISTINCT FROM OLD.registration_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'payment quote is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_quote_no_mutation
BEFORE UPDATE ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_payment_quote_mutation();

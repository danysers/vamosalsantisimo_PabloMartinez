CREATE OR REPLACE FUNCTION prevent_payment_quote_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.registration_id IS DISTINCT FROM OLD.registration_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.group_request_hash IS DISTINCT FROM OLD.group_request_hash THEN
    RAISE EXCEPTION 'payment quote is immutable';
  END IF;
  RETURN NEW;
END $$;

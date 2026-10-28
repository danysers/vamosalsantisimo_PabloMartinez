ALTER TABLE payment_attempts ADD COLUMN replaces_attempt_id uuid UNIQUE REFERENCES payment_attempts(id);
--> statement-breakpoint
CREATE FUNCTION protect_payment_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.replaces_attempt_id IS DISTINCT FROM OLD.replaces_attempt_id THEN
    RAISE EXCEPTION 'payment predecessor is immutable';
  END IF;
  IF NEW.replaces_attempt_id IS NOT NULL THEN
    IF TG_OP='INSERT' AND NEW.status<>'created' THEN RAISE EXCEPTION 'replacement must start as a quote'; END IF;
    IF TG_OP='UPDATE' AND OLD.status='created' AND NEW.status<>'created'
       AND (SELECT count(*) FROM payment_allocations WHERE attempt_id=NEW.id)<>1 THEN
      RAISE EXCEPTION 'replacement requires one frozen allocation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_replacement_protection BEFORE INSERT OR UPDATE ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION protect_payment_replacement();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_record record;
DECLARE target_workshop uuid;
DECLARE lot_record record;
DECLARE promotion_record record;
BEGIN
  SELECT p.status,p.provider_order_id,p.replaces_attempt_id,p.registration_id,p.source,r.workshop_id
    INTO attempt_record FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id
    WHERE p.id=NEW.attempt_id FOR UPDATE OF p;
  IF NOT FOUND OR attempt_record.status<>'created' OR attempt_record.provider_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment allocation is frozen';
  END IF;
  SELECT workshop_id INTO target_workshop FROM registrations WHERE id=NEW.registration_id;
  SELECT workshop_id,number,amount_minor INTO lot_record FROM workshop_lots WHERE id=NEW.lot_id;
  IF target_workshop IS DISTINCT FROM attempt_record.workshop_id
     OR lot_record.workshop_id IS DISTINCT FROM target_workshop
     OR NEW.lot_number IS DISTINCT FROM lot_record.number THEN
    RAISE EXCEPTION 'payment allocation does not match workshop lot';
  END IF;
  -- Only an explicit one-to-one successor can copy a previous frozen quote.
  -- A price edit or expired promotion must not reprice an existing enrolment.
  IF attempt_record.replaces_attempt_id IS NOT NULL THEN
    IF NEW.registration_id IS DISTINCT FROM attempt_record.registration_id
       OR NOT EXISTS(SELECT 1 FROM payment_attempts previous JOIN payment_allocations a ON a.attempt_id=previous.id
          JOIN registrations r ON r.id=previous.registration_id
          WHERE previous.id=attempt_record.replaces_attempt_id AND previous.status='cancelled' AND previous.paid_amount_minor=0
            AND previous.registration_id=NEW.registration_id AND r.status='pending'
            AND previous.source IN ('mercado_pago','bank_transfer','on_site')
            AND attempt_record.source IN ('mercado_pago','bank_transfer','on_site') AND previous.source<>attempt_record.source
            AND (SELECT count(*) FROM payment_allocations WHERE attempt_id=previous.id)=1
            AND a.registration_id=NEW.registration_id AND a.lot_id=NEW.lot_id AND a.lot_number=NEW.lot_number
            AND a.promotion_id IS NOT DISTINCT FROM NEW.promotion_id AND a.promotion_code IS NOT DISTINCT FROM NEW.promotion_code
            AND a.base_amount_minor=NEW.base_amount_minor AND a.discount_minor=NEW.discount_minor AND a.due_amount_minor=NEW.due_amount_minor) THEN
      RAISE EXCEPTION 'replacement must copy its original allocation exactly';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.base_amount_minor IS DISTINCT FROM lot_record.amount_minor THEN
    RAISE EXCEPTION 'payment allocation does not match workshop lot';
  END IF;
  IF NEW.promotion_id IS NULL AND NEW.promotion_code IS NOT NULL THEN RAISE EXCEPTION 'promotion snapshot requires promotion'; END IF;
  IF NEW.promotion_id IS NOT NULL THEN
    SELECT workshop_id,code,active,starts_at,ends_at INTO promotion_record FROM workshop_promotions WHERE id=NEW.promotion_id;
    IF promotion_record.workshop_id IS DISTINCT FROM target_workshop OR promotion_record.code IS DISTINCT FROM NEW.promotion_code
       OR promotion_record.active IS DISTINCT FROM true
       OR (promotion_record.starts_at IS NOT NULL AND promotion_record.starts_at>now())
       OR (promotion_record.ends_at IS NOT NULL AND promotion_record.ends_at<=now()) THEN
      RAISE EXCEPTION 'promotion unavailable for workshop';
    END IF;
    IF EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=NEW.attempt_id AND a.promotion_id=NEW.promotion_id AND a.lot_id<>NEW.lot_id) THEN
      RAISE EXCEPTION 'promotion requires one lot price';
    END IF;
  END IF;
  RETURN NEW;
END $$;

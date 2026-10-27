ALTER TABLE "workshop_promotions" DROP CONSTRAINT "promotion_valid_shape";--> statement-breakpoint
ALTER TABLE "workshop_promotions" ADD CONSTRAINT "promotion_valid_shape" CHECK ((
    "workshop_promotions"."kind" = 'bundle' AND "workshop_promotions"."bundle_size" IS NOT NULL AND "workshop_promotions"."payable_people" IS NOT NULL
      AND "workshop_promotions"."bundle_size" >= 2 AND "workshop_promotions"."payable_people" >= 1
      AND "workshop_promotions"."payable_people" < "workshop_promotions"."bundle_size"
      AND "workshop_promotions"."min_people" IS NULL AND "workshop_promotions"."max_people" IS NULL AND "workshop_promotions"."group_total_minor" IS NULL
  ) OR (
    "workshop_promotions"."kind" = 'group_fixed' AND "workshop_promotions"."bundle_size" IS NULL AND "workshop_promotions"."payable_people" IS NULL
      AND "workshop_promotions"."min_people" IS NOT NULL AND "workshop_promotions"."max_people" IS NOT NULL AND "workshop_promotions"."group_total_minor" IS NOT NULL
      AND "workshop_promotions"."min_people" >= 2 AND "workshop_promotions"."max_people" >= "workshop_promotions"."min_people"
      AND "workshop_promotions"."group_total_minor" > 0
  ));
--> statement-breakpoint
CREATE FUNCTION registration_has_approved_payment(target_registration uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT EXISTS (
    SELECT 1 FROM payment_attempts p
    WHERE p.status = 'approved' AND p.paid_amount_minor >= p.amount_minor
      AND (
        EXISTS (SELECT 1 FROM payment_allocations a
                WHERE a.attempt_id = p.id AND a.registration_id = target_registration)
        OR (p.registration_id = target_registration
            AND NOT EXISTS (SELECT 1 FROM payment_allocations a WHERE a.attempt_id = p.id))
      )
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_accreditation_eligible() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration_state registration_status;
BEGIN
  SELECT status INTO registration_state FROM registrations WHERE id = NEW.registration_id FOR UPDATE;
  IF registration_state IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'accreditation requires confirmed registration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM registration_intakes WHERE registration_id = NEW.registration_id) THEN
    RAISE EXCEPTION 'accreditation requires complete intake';
  END IF;
  IF NEW.reason = 'paid' AND NOT registration_has_approved_payment(NEW.registration_id) THEN
    RAISE EXCEPTION 'accreditation requires verified full payment';
  END IF;
  IF NEW.reason = 'assistance_approved' AND NOT EXISTS (
    SELECT 1 FROM assistance_requests
    WHERE registration_id = NEW.registration_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'accreditation requires approved assistance';
  END IF;
  IF NEW.reason = 'waived' AND NOT EXISTS (
    SELECT 1 FROM fee_waivers
    WHERE registration_id = NEW.registration_id AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'accreditation requires approved waiver';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION revoke_accreditation_when_payment_reversed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    UPDATE accreditation_credentials c
      SET revoked_at = now(), revocation_reason = 'payment_reversed'
      WHERE c.reason = 'paid' AND c.revoked_at IS NULL
        AND (c.registration_id = NEW.registration_id OR EXISTS (
          SELECT 1 FROM payment_allocations a
          WHERE a.attempt_id = NEW.id AND a.registration_id = c.registration_id
        ))
        AND NOT registration_has_approved_payment(c.registration_id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION revoke_accreditation_when_waiver_reversed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    UPDATE accreditation_credentials
      SET revoked_at = now(), revocation_reason = 'waiver_reversed'
      WHERE registration_id = NEW.registration_id AND reason = 'waived' AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER waiver_reversed_revoke_accreditation
AFTER UPDATE OF revoked_at ON fee_waivers
FOR EACH ROW EXECUTE FUNCTION revoke_accreditation_when_waiver_reversed();
--> statement-breakpoint
CREATE FUNCTION validate_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_record record;
DECLARE target_workshop uuid;
DECLARE lot_record record;
DECLARE promotion_record record;
BEGIN
  SELECT p.status, p.provider_order_id, r.workshop_id
    INTO attempt_record
    FROM payment_attempts p JOIN registrations r ON r.id = p.registration_id
    WHERE p.id = NEW.attempt_id FOR UPDATE OF p;
  IF NOT FOUND OR attempt_record.status <> 'created' OR attempt_record.provider_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment allocation is frozen';
  END IF;
  SELECT workshop_id INTO target_workshop FROM registrations WHERE id = NEW.registration_id;
  SELECT workshop_id, number, amount_minor INTO lot_record FROM workshop_lots WHERE id = NEW.lot_id;
  IF target_workshop IS DISTINCT FROM attempt_record.workshop_id
     OR lot_record.workshop_id IS DISTINCT FROM target_workshop
     OR NEW.lot_number IS DISTINCT FROM lot_record.number
     OR NEW.base_amount_minor IS DISTINCT FROM lot_record.amount_minor THEN
    RAISE EXCEPTION 'payment allocation does not match workshop lot';
  END IF;
  IF NEW.promotion_id IS NULL AND NEW.promotion_code IS NOT NULL THEN
    RAISE EXCEPTION 'promotion snapshot requires promotion';
  END IF;
  IF NEW.promotion_id IS NOT NULL THEN
    SELECT workshop_id, code, active, starts_at, ends_at
      INTO promotion_record FROM workshop_promotions WHERE id = NEW.promotion_id;
    IF promotion_record.workshop_id IS DISTINCT FROM target_workshop
       OR promotion_record.code IS DISTINCT FROM NEW.promotion_code
       OR promotion_record.active IS DISTINCT FROM true
       OR (promotion_record.starts_at IS NOT NULL AND promotion_record.starts_at > now())
       OR (promotion_record.ends_at IS NOT NULL AND promotion_record.ends_at <= now()) THEN
      RAISE EXCEPTION 'promotion unavailable for workshop';
    END IF;
    IF EXISTS (SELECT 1 FROM payment_allocations a WHERE a.attempt_id = NEW.attempt_id
               AND a.promotion_id = NEW.promotion_id AND a.lot_id <> NEW.lot_id) THEN
      RAISE EXCEPTION 'promotion requires one lot price';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_allocation_before_insert
BEFORE INSERT ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation();
--> statement-breakpoint
CREATE FUNCTION verify_payment_quote_before_processing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total_due bigint;
DECLARE members integer;
BEGIN
  IF OLD.status = 'created' AND NEW.status <> 'created' THEN
    SELECT coalesce(sum(due_amount_minor), 0), count(*) INTO total_due, members
      FROM payment_allocations WHERE attempt_id = NEW.id;
    IF members > 0 AND total_due <> NEW.amount_minor THEN
      RAISE EXCEPTION 'payment allocations do not match charge amount';
    END IF;
    IF NEW.source = 'mercado_pago' AND members = 0 THEN
      RAISE EXCEPTION 'Mercado Pago payment requires priced members';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_quote_before_processing
BEFORE UPDATE OF status ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION verify_payment_quote_before_processing();

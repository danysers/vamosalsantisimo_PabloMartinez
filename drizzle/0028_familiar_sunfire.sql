ALTER TABLE "payment_allocations" DROP CONSTRAINT "allocations_base_positive";--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "allocations_discount_range";--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "allocations_balance";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_amount_positive";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_provider_fee_valid";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "approved_manual_evidence";--> statement-breakpoint
ALTER TABLE "payment_allocations" ALTER COLUMN "base_amount_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ALTER COLUMN "due_amount_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ALTER COLUMN "amount_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_payment_settings" ADD COLUMN "on_site_price_minor" integer;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_base_positive" CHECK ("payment_allocations"."base_amount_minor" IS NULL OR "payment_allocations"."base_amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_discount_range" CHECK (("payment_allocations"."base_amount_minor" IS NULL AND "payment_allocations"."discount_minor" = 0) OR ("payment_allocations"."discount_minor" >= 0 AND "payment_allocations"."discount_minor" <= "payment_allocations"."base_amount_minor"));--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_balance" CHECK (("payment_allocations"."base_amount_minor" IS NULL AND "payment_allocations"."due_amount_minor" IS NULL) OR ("payment_allocations"."base_amount_minor" IS NOT NULL AND "payment_allocations"."due_amount_minor" = "payment_allocations"."base_amount_minor" - "payment_allocations"."discount_minor"));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_amount_positive" CHECK ("payment_attempts"."amount_minor" > 0 OR ("payment_attempts"."source" = 'on_site' AND "payment_attempts"."amount_minor" IS NULL AND "payment_attempts"."status" <> 'approved'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_provider_fee_valid" CHECK (("payment_attempts"."source" = 'mercado_pago' AND "payment_attempts"."provider_fee_minor" >= 0 AND "payment_attempts"."provider_fee_minor" < "payment_attempts"."amount_minor") OR ("payment_attempts"."source" <> 'mercado_pago' AND "payment_attempts"."provider_fee_minor" = 0));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "approved_manual_evidence" CHECK ("payment_attempts"."source" = 'mercado_pago' OR "payment_attempts"."status" <> 'approved' OR (
    "payment_attempts"."manual_verified_by" IS NOT NULL AND "payment_attempts"."manual_verified_at" IS NOT NULL
    AND "payment_attempts"."amount_minor" IS NOT NULL AND "payment_attempts"."paid_amount_minor" >= "payment_attempts"."amount_minor"
  ));--> statement-breakpoint
ALTER TABLE "workshop_payment_settings" ADD CONSTRAINT "on_site_price_range" CHECK ("workshop_payment_settings"."on_site_price_minor" IS NULL OR "workshop_payment_settings"."on_site_price_minor" BETWEEN 100 AND 200000000);
--> statement-breakpoint
-- An unpriced cash reservation has NULL, never a fake $0 or an inherited lot price.
-- Its allocation remains immutable; pricing it later creates a new attempt.
CREATE OR REPLACE FUNCTION validate_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_record record;
DECLARE target_workshop uuid;
DECLARE lot_record record;
DECLARE previous_record record;
DECLARE promotion_record record;
DECLARE walk_in_price integer;
BEGIN
  SELECT p.status,p.provider_order_id,p.replaces_attempt_id,p.registration_id,p.source,p.amount_minor,r.workshop_id
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
  IF attempt_record.source='on_site' THEN
    IF NEW.promotion_id IS NOT NULL OR NEW.promotion_code IS NOT NULL OR NEW.discount_minor<>0 THEN
      RAISE EXCEPTION 'cash at door cannot use promotions';
    END IF;
    IF attempt_record.amount_minor IS NULL THEN
      IF NEW.base_amount_minor IS NOT NULL OR NEW.due_amount_minor IS NOT NULL THEN
        RAISE EXCEPTION 'unpriced cash allocation must have no amount';
      END IF;
    ELSE
      SELECT on_site_price_minor INTO walk_in_price FROM workshop_payment_settings WHERE workshop_id=target_workshop;
      IF walk_in_price IS NULL OR NEW.base_amount_minor IS DISTINCT FROM walk_in_price
         OR NEW.due_amount_minor IS DISTINCT FROM walk_in_price THEN
        RAISE EXCEPTION 'cash allocation does not match door price';
      END IF;
    END IF;
  ELSE
    IF NEW.base_amount_minor IS DISTINCT FROM lot_record.amount_minor THEN
      RAISE EXCEPTION 'payment allocation does not match workshop lot';
    END IF;
    IF NEW.promotion_id IS NULL AND NEW.promotion_code IS NOT NULL THEN
      RAISE EXCEPTION 'promotion snapshot requires promotion';
    END IF;
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
  END IF;
  IF attempt_record.replaces_attempt_id IS NOT NULL THEN
    SELECT p.source,p.amount_minor,p.paid_amount_minor,p.status,p.provider_order_id,a.registration_id,a.lot_id,a.lot_number,
      a.promotion_id,a.promotion_code,a.base_amount_minor,a.discount_minor,a.due_amount_minor
      INTO previous_record FROM payment_attempts p JOIN payment_allocations a ON a.attempt_id=p.id
      WHERE p.id=attempt_record.replaces_attempt_id AND p.registration_id=NEW.registration_id;
    IF NOT FOUND OR previous_record.status<>'cancelled' OR previous_record.paid_amount_minor<>0
       OR NEW.registration_id IS DISTINCT FROM attempt_record.registration_id
       OR previous_record.lot_id IS DISTINCT FROM NEW.lot_id OR previous_record.lot_number IS DISTINCT FROM NEW.lot_number
       OR (SELECT count(*) FROM payment_allocations WHERE attempt_id=attempt_record.replaces_attempt_id)<>1
       OR previous_record.source NOT IN ('mercado_pago','bank_transfer','on_site')
       OR attempt_record.source NOT IN ('mercado_pago','bank_transfer','on_site')
       OR (previous_record.source=attempt_record.source AND NOT
          (attempt_record.source='on_site' AND previous_record.amount_minor IS NULL AND attempt_record.amount_minor IS NOT NULL)) THEN
      RAISE EXCEPTION 'invalid payment replacement';
    END IF;
    -- Online/alias switching keeps its frozen lot quote. Cash uses a separate
    -- door price and is deliberately repriced when switching methods.
    IF previous_record.source<>'on_site' AND attempt_record.source<>'on_site' AND
       (previous_record.promotion_id IS DISTINCT FROM NEW.promotion_id
        OR previous_record.promotion_code IS DISTINCT FROM NEW.promotion_code
        OR previous_record.base_amount_minor IS DISTINCT FROM NEW.base_amount_minor
        OR previous_record.discount_minor IS DISTINCT FROM NEW.discount_minor
        OR previous_record.due_amount_minor IS DISTINCT FROM NEW.due_amount_minor) THEN
      RAISE EXCEPTION 'replacement must copy its original allocation exactly';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION verify_payment_quote_before_processing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total_due bigint;
DECLARE members integer;
DECLARE priced_members integer;
BEGIN
  IF OLD.status='created' AND NEW.status<>'created' THEN
    SELECT coalesce(sum(due_amount_minor),0),count(*),count(due_amount_minor)
      INTO total_due,members,priced_members FROM payment_allocations WHERE attempt_id=NEW.id;
    IF NEW.amount_minor IS NULL THEN
      IF NEW.source<>'on_site' OR members<>1 OR priced_members<>0 THEN
        RAISE EXCEPTION 'unpriced payment must be one cash reservation';
      END IF;
    ELSIF members>0 AND (priced_members<>members OR total_due+NEW.provider_fee_minor<>NEW.amount_minor) THEN
      RAISE EXCEPTION 'payment allocations do not match charge amount';
    END IF;
    IF NEW.source='mercado_pago' AND members=0 THEN RAISE EXCEPTION 'Mercado Pago payment requires priced members'; END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE registrations ADD COLUMN registered_at_override timestamptz,
  ADD COLUMN accreditation_blocked boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE registration_admin_changes (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registrations(id),
  operator_id uuid NOT NULL REFERENCES admin_users(id),
  payload_hash text NOT NULL CHECK(length(payload_hash)=64),
  previous_attempt_id uuid REFERENCES payment_attempts(id),
  new_attempt_id uuid UNIQUE,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
  changes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX registration_admin_changes_history ON registration_admin_changes(registration_id,created_at DESC);
--> statement-breakpoint
ALTER TABLE payment_attempts ADD COLUMN admin_change_id uuid UNIQUE REFERENCES registration_admin_changes(id),
  ADD COLUMN superseded_by_admin uuid REFERENCES registration_admin_changes(id),
  ADD COLUMN reported_source payment_source,
  ADD COLUMN reported_fee_minor integer NOT NULL DEFAULT 0 CHECK(reported_fee_minor>=0 AND (reported_fee_minor=0 OR (reported_source IS NOT NULL AND reported_source='mercado_pago' AND reported_fee_minor<amount_minor)));
--> statement-breakpoint
ALTER TABLE payment_allocations ADD COLUMN admin_change_id uuid REFERENCES registration_admin_changes(id);
--> statement-breakpoint
CREATE FUNCTION protect_admin_payment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.admin_change_id IS DISTINCT FROM OLD.admin_change_id OR NEW.reported_source IS DISTINCT FROM OLD.reported_source OR NEW.reported_fee_minor IS DISTINCT FROM OLD.reported_fee_minor
      OR (OLD.superseded_by_admin IS NOT NULL AND NEW.superseded_by_admin IS DISTINCT FROM OLD.superseded_by_admin)) THEN
    RAISE EXCEPTION 'administrative payment provenance is immutable';
  END IF;
  IF TG_OP='INSERT' AND NEW.admin_change_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM registration_admin_changes c JOIN admin_users o ON o.id=c.operator_id
    WHERE c.id=NEW.admin_change_id AND c.new_attempt_id=NEW.id AND o.role='configuration' AND NOT o.disabled
  ) THEN RAISE EXCEPTION 'invalid administrative payment'; END IF;
  IF NEW.superseded_by_admin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM registration_admin_changes c WHERE c.id=NEW.superseded_by_admin AND c.previous_attempt_id=NEW.id
  ) THEN RAISE EXCEPTION 'invalid administrative predecessor'; END IF;
  IF NEW.reported_source IS NOT NULL AND NEW.admin_change_id IS NULL THEN RAISE EXCEPTION 'reported method requires administrative provenance'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_payment_provenance BEFORE INSERT OR UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION protect_admin_payment_change();
--> statement-breakpoint
DROP TRIGGER payment_allocation_before_insert ON payment_allocations;
--> statement-breakpoint
CREATE TRIGGER payment_allocation_before_insert BEFORE INSERT ON payment_allocations
  FOR EACH ROW WHEN (NEW.admin_change_id IS NULL) EXECUTE FUNCTION validate_payment_allocation();
--> statement-breakpoint
CREATE FUNCTION validate_admin_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record; c record; target_workshop uuid; lot_workshop uuid;
BEGIN
  SELECT * INTO p FROM payment_attempts WHERE id=NEW.attempt_id FOR UPDATE;
  IF p.admin_change_id IS NULL AND NEW.admin_change_id IS NULL THEN RETURN NEW; END IF;
  IF p.admin_change_id IS DISTINCT FROM NEW.admin_change_id OR p.status<>'created' OR p.provider_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid administrative allocation';
  END IF;
  SELECT x.* INTO c FROM registration_admin_changes x JOIN admin_users o ON o.id=x.operator_id
    WHERE x.id=p.admin_change_id AND x.new_attempt_id=p.id AND o.role='configuration' AND NOT o.disabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'administrative allocation requires owner'; END IF;
  SELECT workshop_id INTO target_workshop FROM registrations WHERE id=NEW.registration_id;
  SELECT workshop_id INTO lot_workshop FROM workshop_lots WHERE id=NEW.lot_id AND number=NEW.lot_number;
  IF target_workshop IS DISTINCT FROM lot_workshop OR target_workshop IS DISTINCT FROM (SELECT workshop_id FROM registrations WHERE id=p.registration_id)
    OR target_workshop IS DISTINCT FROM (SELECT workshop_id FROM registrations WHERE id=c.registration_id)
    OR NEW.promotion_id IS NOT NULL OR NEW.promotion_code IS NOT NULL
    OR (p.source='on_site' AND NEW.discount_minor<>0) THEN RAISE EXCEPTION 'administrative allocation scope mismatch'; END IF;
  IF c.previous_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payment_allocations old WHERE old.attempt_id=c.previous_attempt_id AND old.registration_id=NEW.registration_id
  ) AND NEW.registration_id IS DISTINCT FROM (SELECT registration_id FROM payment_attempts WHERE id=c.previous_attempt_id) THEN
    RAISE EXCEPTION 'administrative allocation cannot add group members';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_payment_allocation_before_insert BEFORE INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION validate_admin_payment_allocation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION registration_has_approved_payment(target_registration uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT registration_is_current(target_registration) AND EXISTS (
    SELECT 1 FROM payment_attempts p WHERE p.superseded_by_admin IS NULL AND p.status='approved' AND p.paid_amount_minor>=p.amount_minor
      AND (EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=p.id AND a.registration_id=target_registration)
        OR (p.registration_id=target_registration AND NOT EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=p.id)))
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION workshop_lot_paid_places(target_workshop uuid,target_lot integer) RETURNS integer LANGUAGE sql VOLATILE AS $$
  SELECT count(DISTINCT r.id)::integer FROM registrations r JOIN payment_allocations a ON a.registration_id=r.id
    JOIN payment_attempts p ON p.id=a.attempt_id
  WHERE r.workshop_id=target_workshop AND a.lot_number=target_lot AND r.status='confirmed' AND registration_is_current(r.id)
    AND p.superseded_by_admin IS NULL AND p.source IN ('mercado_pago','bank_transfer','manual')
    AND p.status='approved' AND p.amount_minor IS NOT NULL AND p.paid_amount_minor>=p.amount_minor
$$;

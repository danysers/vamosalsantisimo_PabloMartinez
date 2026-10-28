ALTER TABLE "admin_users" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_auth_user_id_unique" UNIQUE("auth_user_id");
--> statement-breakpoint
CREATE FUNCTION ensure_accreditation_eligible() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration_state registration_status;
BEGIN
  SELECT status INTO registration_state FROM registrations WHERE id = NEW.registration_id FOR UPDATE;
  IF registration_state IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'accreditation requires confirmed registration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM registration_intakes WHERE registration_id = NEW.registration_id) THEN
    RAISE EXCEPTION 'accreditation requires complete intake';
  END IF;
  IF NEW.reason = 'paid' AND NOT EXISTS (
    SELECT 1 FROM payment_attempts
    WHERE registration_id = NEW.registration_id AND status = 'approved'
      AND paid_amount_minor >= amount_minor
  ) THEN
    RAISE EXCEPTION 'accreditation requires verified full payment';
  END IF;
  IF NEW.reason = 'assistance_approved' AND NOT EXISTS (
    SELECT 1 FROM assistance_requests
    WHERE registration_id = NEW.registration_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'accreditation requires approved assistance';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accreditation_eligibility_before_insert
BEFORE INSERT ON accreditation_credentials
FOR EACH ROW EXECUTE FUNCTION ensure_accreditation_eligible();
--> statement-breakpoint
CREATE FUNCTION ensure_valid_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential_state record;
BEGIN
  SELECT c.registration_id, c.revoked_at, c.expires_at, r.status
    INTO credential_state
    FROM accreditation_credentials c
    JOIN registrations r ON r.id = c.registration_id
    WHERE c.id = NEW.credential_id
    FOR UPDATE OF c, r;
  IF NOT FOUND OR credential_state.registration_id IS DISTINCT FROM NEW.registration_id
    OR credential_state.revoked_at IS NOT NULL
    OR credential_state.expires_at <= now()
    OR credential_state.status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'invalid accreditation for check-in';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER check_in_credential_before_insert
BEFORE INSERT ON check_ins
FOR EACH ROW EXECUTE FUNCTION ensure_valid_check_in();
--> statement-breakpoint
CREATE FUNCTION revoke_accreditation_when_unconfirmed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
    UPDATE accreditation_credentials
      SET revoked_at = now(), revocation_reason = 'registration_unconfirmed'
      WHERE registration_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER registration_unconfirmed_revoke_accreditation
AFTER UPDATE OF status ON registrations
FOR EACH ROW EXECUTE FUNCTION revoke_accreditation_when_unconfirmed();
--> statement-breakpoint
CREATE FUNCTION revoke_accreditation_when_payment_reversed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'approved' AND NEW.status <> 'approved'
     AND NOT EXISTS (
       SELECT 1 FROM payment_attempts
       WHERE registration_id = NEW.registration_id AND id <> NEW.id
         AND status = 'approved' AND paid_amount_minor >= amount_minor
     ) THEN
    UPDATE accreditation_credentials
      SET revoked_at = now(), revocation_reason = 'payment_reversed'
      WHERE registration_id = NEW.registration_id AND reason = 'paid' AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_reversed_revoke_accreditation
AFTER UPDATE OF status ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION revoke_accreditation_when_payment_reversed();
--> statement-breakpoint
CREATE FUNCTION revoke_accreditation_when_assistance_reversed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    UPDATE accreditation_credentials
      SET revoked_at = now(), revocation_reason = 'assistance_reversed'
      WHERE registration_id = NEW.registration_id AND reason = 'assistance_approved' AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER assistance_reversed_revoke_accreditation
AFTER UPDATE OF status ON assistance_requests
FOR EACH ROW EXECUTE FUNCTION revoke_accreditation_when_assistance_reversed();

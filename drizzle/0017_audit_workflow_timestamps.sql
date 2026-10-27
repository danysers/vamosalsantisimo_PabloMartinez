-- Append-only timeline for enrollment/payment state changes. Keep only status,
-- amounts and provider state; never copy contact details or payment tokens.
CREATE FUNCTION audit_registration_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (action,subject_id,changes,created_at)
      VALUES ('registration.created',NEW.id,jsonb_build_object('status',NEW.status),clock_timestamp());
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_log (action,subject_id,changes,created_at)
      VALUES ('registration.status_changed',NEW.id,
        jsonb_build_object('from',OLD.status,'to',NEW.status),clock_timestamp());
  END IF;
  RETURN NEW;
END; $$;--> statement-breakpoint
CREATE TRIGGER registration_state_audit
AFTER INSERT OR UPDATE OF status ON registrations
FOR EACH ROW EXECUTE FUNCTION audit_registration_state();--> statement-breakpoint
CREATE FUNCTION audit_payment_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (action,subject_id,changes,created_at)
      VALUES ('payment.created',NEW.id,
        jsonb_build_object('status',NEW.status,'source',NEW.source,'amountMinor',NEW.amount_minor),clock_timestamp());
  ELSIF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.paid_amount_minor IS DISTINCT FROM NEW.paid_amount_minor
     OR OLD.provider_status IS DISTINCT FROM NEW.provider_status THEN
    INSERT INTO audit_log (actor_id,action,subject_id,changes,created_at)
      VALUES (NEW.manual_verified_by,'payment.state_changed',NEW.id,
        jsonb_build_object('from',OLD.status,'to',NEW.status,
          'paidAmountMinor',NEW.paid_amount_minor,'providerStatus',NEW.provider_status),clock_timestamp());
  END IF;
  RETURN NEW;
END; $$;--> statement-breakpoint
CREATE TRIGGER payment_state_audit
AFTER INSERT OR UPDATE OF status,paid_amount_minor,provider_status ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION audit_payment_state();

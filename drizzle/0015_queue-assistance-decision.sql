-- Custom SQL migration file, put your code below! --
DROP TRIGGER assistance_approved_queue_email ON assistance_requests;--> statement-breakpoint
DROP FUNCTION queue_assistance_approval_email();--> statement-breakpoint
CREATE FUNCTION queue_assistance_decision_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved', 'declined') THEN
    INSERT INTO email_outbox (dedupe_key, kind, to_email, registration_id)
    SELECT 'assistance:' || NEW.registration_id::text || ':' || NEW.status::text || ':' || gen_random_uuid()::text,
           CASE WHEN NEW.status = 'approved' THEN 'assistance_approved'::email_kind
                ELSE 'assistance_declined'::email_kind END,
           r.email, r.id
    FROM registrations r WHERE r.id = NEW.registration_id;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER assistance_decision_queue_email
AFTER UPDATE OF status ON assistance_requests
FOR EACH ROW EXECUTE FUNCTION queue_assistance_decision_email();

-- Custom SQL migration file, put your code below! --
-- Queue the participant's exception email only after a reviewed request
-- actually transitions to approved. The worker rechecks the current state
-- before sending, so a reversal cancels a stale queued message.
CREATE FUNCTION queue_assistance_approval_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved' THEN
    INSERT INTO email_outbox (dedupe_key, kind, to_email, registration_id)
    SELECT 'assistance:' || NEW.registration_id::text || ':approved:' || gen_random_uuid()::text,
           'assistance_approved', r.email, r.id
    FROM registrations r WHERE r.id = NEW.registration_id;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER assistance_approved_queue_email
AFTER UPDATE OF status ON assistance_requests
FOR EACH ROW EXECUTE FUNCTION queue_assistance_approval_email();

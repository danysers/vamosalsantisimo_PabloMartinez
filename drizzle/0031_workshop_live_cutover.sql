ALTER TABLE "workshops" ADD COLUMN "live_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "is_test" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE FUNCTION registration_is_current(target_registration uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT w.live_started_at IS NULL OR (NOT r.is_test AND r.created_at >= w.live_started_at)
  FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.id=target_registration
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION registration_has_approved_payment(target_registration uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
  SELECT registration_is_current(target_registration) AND EXISTS (
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
-- Recheck the payment/exception at the instant of entry, not only when the QR
-- was first issued. This is defense in depth if a reversal races a scan.
CREATE OR REPLACE FUNCTION ensure_valid_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential_state record;
BEGIN
  SELECT c.registration_id, c.reason, c.revoked_at, c.expires_at, r.status,
         registration_has_approved_payment(r.id) AS paid,
         a.status AS assistance_status,
         fw.registration_id IS NOT NULL AS waived
    INTO credential_state
    FROM accreditation_credentials c
    JOIN registrations r ON r.id = c.registration_id
    LEFT JOIN assistance_requests a ON a.registration_id = r.id
    LEFT JOIN fee_waivers fw ON fw.registration_id = r.id AND fw.revoked_at IS NULL
    WHERE c.id = NEW.credential_id AND registration_is_current(r.id)
    FOR UPDATE OF c, r;
  IF NOT FOUND OR credential_state.registration_id IS DISTINCT FROM NEW.registration_id
    OR credential_state.revoked_at IS NOT NULL
    OR credential_state.expires_at <= now()
    OR credential_state.status IS DISTINCT FROM 'confirmed'
    OR (CASE credential_state.reason
      WHEN 'paid' THEN credential_state.paid
      WHEN 'assistance_approved' THEN credential_state.assistance_status = 'approved'
      WHEN 'waived' THEN credential_state.waived
      ELSE false END) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invalid accreditation for check-in';
  END IF;
  RETURN NEW;
END; $$;

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
    WHERE c.id = NEW.credential_id
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

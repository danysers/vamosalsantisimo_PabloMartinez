ALTER TABLE "registrations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_deleted_by_admin_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_deletion_actor" CHECK (("registrations"."deleted_at" IS NULL) = ("registrations"."deleted_by" IS NULL));
--> statement-breakpoint
-- Financial reconciliation must still record provider updates for deleted
-- registrations. Keep the live/history boundary separate from eligibility.
CREATE FUNCTION registration_is_live(target_registration uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT w.live_started_at IS NULL OR (NOT r.is_test AND r.created_at >= w.live_started_at)
  FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.id=target_registration
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION registration_is_current(target_registration uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT r.deleted_at IS NULL AND registration_is_live(r.id) FROM registrations r WHERE r.id=target_registration
$$;
--> statement-breakpoint
-- Keep the deletion predicate on the locked row as well, so a concurrent
-- admission rechecks it after waiting for an operator's deletion to commit.
CREATE OR REPLACE FUNCTION ensure_valid_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential_state record;
BEGIN
  SELECT c.registration_id,c.reason,c.revoked_at,c.expires_at,r.status,
    registration_has_approved_payment(r.id) AS paid,a.status AS assistance_status,
    fw.registration_id IS NOT NULL AS waived
  INTO credential_state
  FROM accreditation_credentials c JOIN registrations r ON r.id=c.registration_id
  LEFT JOIN assistance_requests a ON a.registration_id=r.id
  LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
  WHERE c.id=NEW.credential_id AND r.deleted_at IS NULL AND registration_is_current(r.id)
  FOR UPDATE OF c,r;
  IF NOT FOUND OR credential_state.registration_id IS DISTINCT FROM NEW.registration_id
    OR credential_state.revoked_at IS NOT NULL OR credential_state.expires_at<=now()
    OR credential_state.status IS DISTINCT FROM 'confirmed'
    OR (CASE credential_state.reason
      WHEN 'paid' THEN credential_state.paid
      WHEN 'assistance_approved' THEN credential_state.assistance_status='approved'
      WHEN 'waived' THEN credential_state.waived ELSE false END) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invalid accreditation for check-in';
  END IF;
  RETURN NEW;
END; $$;

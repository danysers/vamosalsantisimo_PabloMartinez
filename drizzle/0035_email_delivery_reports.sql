ALTER TABLE registrations ADD COLUMN accreditation_email text;
--> statement-breakpoint
ALTER TABLE registrations ADD CONSTRAINT registrations_accreditation_email_length CHECK (accreditation_email IS NULL OR length(accreditation_email) BETWEEN 3 AND 254);
--> statement-breakpoint
ALTER TABLE email_outbox ADD COLUMN manual_resend boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_manual_resend_kind CHECK (NOT manual_resend OR (kind='accreditation_ready' AND credential_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX email_outbox_accreditation_history ON email_outbox (registration_id,created_at) WHERE kind='accreditation_ready';
--> statement-breakpoint
CREATE TABLE email_delivery_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES email_outbox(id),
  report_key text NOT NULL UNIQUE,
  action text NOT NULL CHECK (action IN ('failed','delayed')),
  enhanced_status text NOT NULL,
  reason_code text NOT NULL,
  diagnostic text NOT NULL,
  reported_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX email_delivery_reports_by_email ON email_delivery_reports (email_id,reported_at DESC);
--> statement-breakpoint
CREATE TABLE email_bounce_sync (
  id integer PRIMARY KEY CHECK (id=1),
  cursors jsonb NOT NULL DEFAULT '{}',
  checked_at timestamptz,
  attempted_at timestamptz,
  last_error_code text
);
--> statement-breakpoint
INSERT INTO email_bounce_sync(id) VALUES(1);

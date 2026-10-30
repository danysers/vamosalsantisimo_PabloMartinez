ALTER TABLE email_bounce_sync ADD COLUMN request_id uuid,
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN requested_by uuid REFERENCES admin_users(id),
  ADD COLUMN request_status text NOT NULL DEFAULT 'idle' CHECK(request_status IN ('idle','queued','running','succeeded','failed')),
  ADD COLUMN completed_request_id uuid,
  ADD COLUMN completed_at timestamptz;

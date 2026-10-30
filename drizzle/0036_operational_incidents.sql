CREATE TABLE operational_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL,
  correlation_id uuid NOT NULL,
  source text NOT NULL CHECK(source IN ('client','server')),
  operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 40),
  code text NOT NULL CHECK(length(code) BETWEEN 1 AND 40),
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(octet_length(details::text)<=1024),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_incidents_identity UNIQUE(source,correlation_id,code)
);
--> statement-breakpoint
CREATE INDEX operational_incidents_by_time ON operational_incidents(event_slug,created_at DESC);
--> statement-breakpoint
CREATE INDEX operational_incidents_by_registration ON operational_incidents(registration_id,created_at DESC);

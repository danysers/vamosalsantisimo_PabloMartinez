ALTER TABLE registration_intakes ADD COLUMN nickname text;
--> statement-breakpoint
ALTER TABLE registration_intakes ADD CONSTRAINT intake_nickname_length
CHECK (nickname IS NULL OR length(trim(nickname)) BETWEEN 1 AND 80);

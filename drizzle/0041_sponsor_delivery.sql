ALTER TYPE "public"."admin_role" ADD VALUE 'sponsor';--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "sponsor_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ADD COLUMN "logo_data_base64" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ADD COLUMN "logo_checksum" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ALTER COLUMN "logo_data_base64" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ALTER COLUMN "logo_checksum" DROP DEFAULT;--> statement-breakpoint
UPDATE admin_users SET sponsor_access = true
WHERE id = (SELECT id FROM admin_users WHERE disabled = false AND auth_user_id IS NOT NULL LIMIT 1)
  AND (SELECT count(*) FROM admin_users WHERE disabled = false AND auth_user_id IS NOT NULL) = 1;

CREATE TABLE "workshop_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"brand_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"logo_drive_file_id" text NOT NULL,
	"logo_filename" text NOT NULL,
	"logo_mime_type" text NOT NULL,
	"logo_size_bytes" integer NOT NULL,
	"phone" text,
	"email" text,
	"announcement" text,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_sponsors_logo_drive_file_id_unique" UNIQUE("logo_drive_file_id"),
	CONSTRAINT "workshop_sponsors_brand_present" CHECK (length(trim("workshop_sponsors"."brand_name")) BETWEEN 1 AND 90),
	CONSTRAINT "workshop_sponsors_owner_present" CHECK (length(trim("workshop_sponsors"."owner_name")) BETWEEN 1 AND 120),
	CONSTRAINT "workshop_sponsors_logo_filename_present" CHECK (length(trim("workshop_sponsors"."logo_filename")) BETWEEN 1 AND 140),
	CONSTRAINT "workshop_sponsors_logo_type" CHECK ("workshop_sponsors"."logo_mime_type" IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "workshop_sponsors_logo_size" CHECK ("workshop_sponsors"."logo_size_bytes" BETWEEN 1 AND 4194304),
	CONSTRAINT "workshop_sponsors_phone_length" CHECK ("workshop_sponsors"."phone" IS NULL OR length("workshop_sponsors"."phone") <= 50),
	CONSTRAINT "workshop_sponsors_email_length" CHECK ("workshop_sponsors"."email" IS NULL OR length("workshop_sponsors"."email") <= 254),
	CONSTRAINT "workshop_sponsors_announcement_length" CHECK ("workshop_sponsors"."announcement" IS NULL OR length("workshop_sponsors"."announcement") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ADD CONSTRAINT "workshop_sponsors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ADD CONSTRAINT "workshop_sponsors_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_sponsors" ADD CONSTRAINT "workshop_sponsors_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_sponsors_event_brand_unique" ON "workshop_sponsors" USING btree ("event_id",lower(trim("brand_name")));--> statement-breakpoint
CREATE INDEX "workshop_sponsors_by_event_updated" ON "workshop_sponsors" USING btree ("event_id","updated_at");
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_end" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "creation_key" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_creation_key_unique" UNIQUE("creation_key");
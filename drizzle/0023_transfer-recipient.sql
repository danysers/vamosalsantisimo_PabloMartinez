ALTER TABLE "workshop_payment_settings" ADD COLUMN "transfer_holder" text;--> statement-breakpoint
ALTER TABLE "workshop_payment_settings" ADD COLUMN "transfer_document" text;
--> statement-breakpoint
UPDATE workshop_payment_settings AS settings
SET transfer_alias = 'vamosalsantisimo',
    transfer_provider = 'Personal Pay',
    transfer_holder = 'Sergio Daniel Servin',
    transfer_document = '39320953',
    updated_at = now()
FROM workshops AS workshop JOIN events AS event ON event.id = workshop.event_id
WHERE settings.workshop_id = workshop.id AND event.slug = 'formacion-catolica-2026';

-- Checkout / tarjeta / contado / acreditación a 35 días: el simulador de la
-- cuenta de Mercado Pago indicó $10.188,49 para recibir $10.000 (28/10/2026).
-- Solo sustituimos el antiguo recargo genérico de $1.000; conservamos los
-- demás importes configurados y los pagos ya cotizados.
ALTER TABLE workshop_payment_settings ALTER COLUMN online_service_fee_minor SET DEFAULT 18849;
--> statement-breakpoint
UPDATE workshop_payment_settings AS settings
SET online_service_fee_minor = 18849, updated_at = now()
FROM workshops AS workshop JOIN events AS event ON event.id = workshop.event_id
WHERE settings.workshop_id = workshop.id
  AND event.slug = 'formacion-catolica-2026'
  AND settings.online_service_fee_minor = 100000;

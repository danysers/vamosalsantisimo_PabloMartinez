# Checkout Pro Argentina: contrato elegido (sin integración activa)

**Variante elegida para una implementación nueva: Checkout Pro vía Orders API**, no Preferences ni QR. La [documentación oficial de creación](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order) y la [referencia de creación](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/create-order/post) consultadas en la fecha de ejecución indican `POST https://api.mercadopago.com/v1/orders`, `type: online`, `processing_mode: manual`, importes decimales exactos en strings, `external_reference`, `X-Idempotency-Key` (UUID único por intento) y respuesta `checkout_url`. No copiar el `notification_url` de Preferences: en Orders la configuración de webhooks se realiza en la aplicación. No se han probado credenciales de la organización.

La [guía de webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/resources/notifications/webhooks) describe `x-signature`, secreto configurado en la aplicación y HMAC; **un header presente no prueba autenticidad**. Consultar cada notificación admitida en la API autenticada correspondiente, comprobar receptor, entorno, referencia, ARS, monto congelado y transición de estado; guardar evento antes de responder y reconciliar reintentos. Aislar topics de Orders de topics `payment`/`merchant_order` de otras integraciones; confirmar con documentación y cuentas de prueba cuál recibe efectivamente esta aplicación antes de activar el webhook.

## Pendiente antes de codificar/activar cobros

1. Validar cuenta vendedora Argentina, credenciales de prueba, Webhook secret y URL HTTPS de prueba; no aceptar tokens reales en Git.
2. Verificar campos exactos de respuesta/estados, eventos suscriptos y retorno configurado usando cuenta de prueba y versión de SDK oficial elegida. Fijar un intento de pago por UUID e importe en enteros menores, convertir solo en límite HTTP a decimal exacto `"10000.00"`.
3. Implementar persistencia con migraciones, idempotencia de negocio, deduplicación de webhooks y jobs de conciliación antes del primer cobro de prueba.
4. Simular webhook inválido/repetido/tardío y caída; después realizar pago E2E con dos cuentas de prueba distintas. Sin cuentas, **la verificación real sigue pendiente**.

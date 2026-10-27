# Checkout Pro Argentina: contrato elegido (sin integración activa)

**Variante elegida para una implementación nueva: Checkout Pro vía Orders API**, no Preferences ni QR. La [documentación oficial de creación](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order) y la [referencia de creación](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/create-order/post) consultadas en la fecha de ejecución indican `POST https://api.mercadopago.com/v1/orders`, `type: online`, `processing_mode: manual`, importes decimales exactos en strings, `external_reference`, `X-Idempotency-Key` (UUID único por intento) y respuesta `checkout_url`. No copiar el `notification_url` de Preferences: en Orders la configuración de webhooks se realiza en la aplicación. No se han probado credenciales de la organización.

La [guía de webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/resources/notifications/webhooks) describe `x-signature`, secreto configurado en la aplicación y HMAC; **un header presente no prueba autenticidad**. Consultar cada notificación admitida en la API autenticada correspondiente, comprobar receptor, entorno, referencia, ARS, monto congelado y transición de estado; guardar evento antes de responder y reconciliar reintentos. Aislar topics de Orders de topics `payment`/`merchant_order` de otras integraciones; confirmar con documentación y cuentas de prueba cuál recibe efectivamente esta aplicación antes de activar el webhook.

## Estado local actual

`lib/checkout-pro-contract.ts` construye el pedido con importe decimal exacto y verifica que la respuesta coincida en referencia, importe, moneda ARS, país ARG, estado y destino HTTPS de Mercado Pago. `lib/mercado-pago-client.ts` contiene un adaptador **solo de servidor** que crea la order con la misma clave de idempotencia de un intento persistido; además exige `MP_CHECKOUT_ENABLED=1` y `MP_ACCESS_TOKEN`. No hay ninguna ruta pública que lo llame, ni se conecta al formulario: **ningún visitante puede iniciar un cobro desde este código por ahora**. Las pruebas del contrato usan respuestas simuladas y no contactan Mercado Pago.

Según la [referencia actual de errores de la Orders API](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/create-order/post), Checkout Pro vía Orders no admite las antiguas credenciales de prueba: se deben validar las cuentas de prueba y credenciales que correspondan a este producto directamente con Mercado Pago antes de habilitarlo.

## Pendiente antes de activar cobros

1. Confirmar titular de la cuenta vendedora Argentina, entorno/cuentas de prueba admitidos por Orders, Webhook secret y URL HTTPS de prueba; no aceptar tokens reales en Git ni en el navegador.
2. Aprobar el importe real del taller y la política de lotes/asistencia. `lib/registration-policy.ts` contiene montos de referencia, **no una autorización para cobrar**. La base de datos debe fijar el importe del intento antes de llamar al proveedor.
3. Verificar campos exactos de respuesta/estados, eventos suscriptos y retorno configurado con cuentas de prueba. Fijar un intento de pago por UUID e importe en centavos antes del POST; reintentos de ese intento deben reutilizar su clave.
4. Conectar la inscripción real (el formulario visible hoy es una vista previa local), persistir el intento, implementar deduplicación de webhooks y conciliación antes de habilitar el botón de pago.
5. Simular webhook inválido/repetido/tardío y caída; después realizar pago E2E con dos cuentas de prueba distintas. Sin cuentas, **la verificación real sigue pendiente**.

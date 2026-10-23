# Inscripciones 2026: backend experimental, NO habilitado al público

La portada y `/inscripcion` continúan mostrando **inscripciones cerradas**. La API de registro solo puede responder 201 si existen PostgreSQL nuevo, evento/taller configurados y `registration_open = true`, opción que por defecto es falsa. No abrirla en producción: todavía faltan la interfaz de inscripción, administración, cobros/verificación y el procedimiento de privacidad.

## Modelo y reglas verificadas

- `drizzle/` contiene migraciones versionadas para eventos, taller, lotes, inscripción, reserva, intento de pago, webhook, operador, auditoría y trabajos. La cuenta 2025 de MySQL no se conecta automáticamente. Todos los instantes de persistencia usan `timestamptz` (UTC); mostrar horarios en `America/Argentina/Buenos_Aires`.
- Para el taller 2026 la organización decidió **cupo sin límite**, almacenado como `capacity = NULL`; también existe el bloqueo por fila y una prueba de la última plaza por si en el futuro se fija un cupo. La lista de espera solo funciona si la organización la habilita. Una reserva pendiente tiene vencimiento configurable (30 min por defecto); la liberación física y las alertas requieren un job futuro. Una reserva vencida ya no consume cupo, pero no equivale a pago confirmado.
- Los lotes tienen precios de referencia **ARS 10.000 / 15.000 / 20.000**, en centavos enteros. Su activación es manual; la compra no se abre hasta que administración, intentos y conciliación estén terminados. La tabla `workshop_lots` permite registrar los montos definitivos y auditar cambios futuros.
- `POST /api/inscripciones` acepta solamente nombre, correo, teléfono y `accessToken` hexadecimal de 32 bytes, más `Idempotency-Key` UUID. Para generar valores en un cliente autorizado: `crypto.randomUUID()` y `Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')`. La aplicación almacena solo SHA-256 del token; guardalo de forma privada en el dispositivo hasta que haya flujo de recuperación verificada. El reenvío con el mismo token y clave devuelve la misma referencia; nombre normalizado + contacto coincidente de otra clave se deriva a revisión (409), sin bloquear familiares con distinto nombre.
- `POST /api/estado` acepta **solo** ese token en JSON y devuelve referencia aleatoria y estado, sin datos de contacto. No existe consulta por ID o correo. `GET` de las rutas antiguas no expone registros. No poner el token en la URL, WhatsApp, logs ni servicios de analítica.
- El rate limit durable usa PostgreSQL; sin un reverse proxy confirmado aplica un tope global de 500 solicitudes en 10 minutos. Con `TRUST_REVERSE_PROXY=1` y `RATE_LIMIT_HMAC_KEY` de al menos 32 bytes se agrega un tope de 10 solicitudes por IP en 10 minutos basado en `x-real-ip` establecido **exclusivamente** por el proxy confiable. No habilitar ese modo con acceso directo al servidor. La limitación del login/checkout no está implementada porque aún no existen esos flujos.

## Comprobación local sin cobros

Usar una instancia PostgreSQL **descartable** y aislada, aplicar `DATABASE_URL=<URL local> pnpm exec drizzle-kit migrate`, construir con `pnpm build`, ejecutar `DATABASE_URL=<URL local> pnpm test` (usa type stripping de Node 22 para la prueba de reglas TypeScript). La prueba crea y borra sus eventos, nunca usa datos personales reales; ejercita concurrencia por última plaza, espera opcional, reintento, familiares, lookup con token y rate limit. Si no se provee `DATABASE_URL`, las pruebas DB aparecen como omitidas, no como superadas.

## Pendiente antes de habilitar

Implementar job de expiración/concilación, chequeos de pago, administración/autenticación/roles, frontend accesible, política de retención/borrado, protección y respaldo/restore de PostgreSQL, configuración de entorno/hosting y recuperación segura del token perdido. Ninguna reserva actual equivale a asistencia confirmada. Nunca confiar en retorno de Mercado Pago ni WhatsApp como comprobante.

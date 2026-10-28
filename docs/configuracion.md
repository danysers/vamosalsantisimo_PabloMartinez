# Configuración del taller 2026

No guardar secretos en Git ni enviarlos por chat. `.env` local está ignorado. **La publicación del 28/10/2026 está configurada para ensayos con Mercado Pago TEST, detrás del usuario y contraseña existentes. No habilita cobros reales.**

## Publicación de ensayo del 28/10/2026

El push a `main` construye la imagen ARM64 en GitHub Actions. El servicio privado de despliegue comprueba GHCR cada 30 segundos y llama al webhook interno de esta aplicación únicamente cuando cambia el digest publicado. Guarda su estado en un volumen para evitar despliegues repetidos. El servidor descarga la imagen; no ejecuta el build de Next.js. La llamada externa desde runners de GitHub recibió HTTP 403, por lo que el servicio interno no depende de ese acceso. El webhook y las credenciales permanecen en Dokploy, fuera del repositorio; GitHub no recibe claves administrativas. `deploy/render-production-compose.mjs` prepara el Compose de copias y despliegue con límites de CPU/memoria, sin puertos ni Docker socket.

La aplicación conserva su dominio y protección existentes. Usa una instancia PostgreSQL propia, volumen persistente y red privada `vas_workshop_production_v2` (`172.30.30.0/24`), sin puerto público. No se importan los registros de desarrollo. El inicio aplica migraciones bajo bloqueo, carga el catálogo de manera idempotente y verifica SMTP antes de habilitar el ensayo.

`WORKSHOP_SANDBOX_REGISTRATIONS=1` requiere `MP_ENVIRONMENT=test` y `MP_CHECKOUT_ENABLED=1`; habilita Mercado Pago de prueba y pago en el taller, y desactiva transferencias bancarias durante el ensayo. `WORKSHOP_EMAIL_WORKER_ENABLED=1` inicia el trabajador junto a la web, con parada y reinicio coordinados. Todos sus correos llevan `[PRUEBA]` y advierten que el QR no acredita el ingreso. El lector real permanece desactivado. Las claves de producción son independientes de localhost y deben conservarse para poder recuperar sus credenciales.

`deploy/production-backups.compose.yml` hace un respaldo cada seis horas y verifica una restauración en una base temporal, sin modificar la base del taller. Sus archivos quedan en un volumen persistente separado. Antes de abrir cobros reales se deben cambiar de manera deliberada las credenciales y el modo de Mercado Pago, configurar la firma del webhook y retirar el interruptor de ensayo; otro build por sí solo no transforma pagos ficticios en reales.

## Variables

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL privado. En Dokploy debe usar el host `postgres` de la red `vas_workshop_private`. |
| `WORKSHOP_EVENT_SLUG` | `formacion-catolica-2026` para el taller sembrado. |
| `SITE_ORIGIN` | Origen HTTPS exacto de la web pública; controla solicitudes del formulario. Solo servicio `app`. |
| `REGISTRATION_EMAIL_READY` | `0` por defecto; `1` **solo después de verificar entrega SMTP real**. |
| `MP_CHECKOUT_ENABLED`, `MP_ENVIRONMENT` | `1` habilita crear checkouts si el medio está activo en la base. Entorno explícito `test` o `production`; no mezclarlos. |
| `MP_ACCESS_TOKEN`, `MP_SELLER_USER_ID`, `MP_APPLICATION_ID` | Credencial del servidor e identidad verificada del vendedor/aplicación. En pruebas, el ID de aplicación de la API puede diferir del panel. |
| `WORKSHOP_CHECKOUT_TOKEN_KEY` | Secreto aleatorio estable de al menos 32 caracteres para autorizar consultas y reintentos de pago. |
| `MP_WEBHOOK_SECRET`, `MP_PUBLIC_ORIGIN` | Secreto de firma y origen público HTTPS para el retorno. El receptor es `/api/mercado-pago/webhook`; nunca apuntar a localhost. |
| `WORKSHOP_LOCAL_TEST_MODE` | Excepción solo de desarrollo loopback + `MP_ENVIRONMENT=test`, para datos ficticios y cola de correo sin SMTP. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | DonWeb Correo Profesional: `a0151359.ferozo.com`, puerto `465` con SSL, usuario `contactos@vamosalsantisimo.com`. Para desarrollo, `SMTP_PASS` va en `.env` local (ignorado por Git); al desplegar, cargarlo como variable secreta en Dokploy. |
| `SMTP_FROM` | Debe ser exactamente `contactos@vamosalsantisimo.com`. |
| `PANEL_ORIGIN`, `BETTER_AUTH_SECRET` | Solo servicio `panel`: origen HTTPS independiente y secreto aleatorio estable de al menos 32 caracteres. Compose pasa `PANEL_ORIGIN` a Better Auth como `BETTER_AUTH_URL`. El perfil `panel` queda inactivo hasta configurarlos. |
| `APP_SURFACE` | `public` en `app`, `panel` en `panel`; separa las rutas aunque ambos contenedores usen la misma imagen. No configurarlo manualmente en Dokploy: Compose ya lo fija. |
| `ADMISSION_SCAN_ENABLED` | Solo panel; `0` por defecto. Poner `1` únicamente cuando se autorice registrar ingresos reales. Cada escaneo genera historial con fecha/hora y operador. |
| `ACCREDITATION_TOKEN_KEY_ID`, `ACCREDITATION_TOKEN_KEY` | Identificador y clave de 32 bytes codificada en base64url para cifrar el QR. Respaldar la clave; no rotarla sin plan. |
| `TRUST_REVERSE_PROXY`, `RATE_LIMIT_HMAC_KEY` | Activar IP confiable solo tras configurar y verificar el proxy; si no, límite global. |
| `POSTGRES_PASSWORD` | Contraseña del stack PostgreSQL de Dokploy; nunca usar la de desarrollo. |
| `WORKSHOP_PRIVATE_NETWORK` | Red Docker privada compartida por los stacks DB y app. En el entorno de prueba: `vas_workshop_prueba_private`; el valor predeterminado de producción no cambia. |
| `WORKSHOP_PRIVATE_NETWORK_EXTERNAL` | Solo stack DB: `false` para que el stack de prueba cree su red; la app siempre se conecta a esa red como externa. No cambiar en servicios de producción. |

El buzón oficial existe en DonWeb y el DNS público responde con MX, SPF, DKIM y DMARC. El organizador confirmó la recepción correcta en Gmail de las variantes enviadas el 27/10/2026. Además, se probó el trabajador con una base PostgreSQL descartable y un transporte simulado, sin enviar nuevos mensajes reales. Esto **no sustituye la prueba del worker real en Dokploy** antes de abrir inscripciones. El comando de vista previa es `pnpm email:test --to CORREO_DE_PRUEBA`; agregar `--send` envía mensajes marcados como prueba y `--only assistance_approved` limita a un solo ejemplo. El QR ficticio no acredita a nadie. `.env*` está excluido de Git y del contexto de Docker; no se despliega automáticamente. `REGISTRATION_EMAIL_READY=1` **no envía correos por sí solo**: habilita la API una vez que el trabajador está conectado y probado. El trabajador lee la cola `email_outbox`, reintenta fallos y registra estados. Los avisos de tasas/plazos de Mercado Pago se dirigirán a `danysers@gmail.com`, pero no se enviarán automáticamente hasta configurar las opciones de acreditación verificadas.

## Desarrollo local

`compose.yaml` levanta PostgreSQL 16 en `127.0.0.1:54321` con volumen nombrado. Preparar un `.env` **local e ignorado** con `POSTGRES_PASSWORD`, `DATABASE_URL`, `WORKSHOP_EVENT_SLUG` y claves aleatorias. Luego: `docker compose up -d`, `node --env-file=.env scripts/migrate.mjs`, `node --env-file=.env scripts/seed-workshop.mjs`, `pnpm dev`. El seed carga los tres lotes ARS 10.000/15.000/20.000, alias y WhatsApp, pero deja inscripción, Mercado Pago, promociones y opciones de acreditación de fondos **inactivos**.

`pnpm test` compila automáticamente el código actual en `.next-test` y usa ese build para las pruebas HTTP, sin reemplazar una vista previa local abierta. Las pruebas de PostgreSQL requieren `DATABASE_URL` de una instancia **descartable y migrada**. No usar la base de producción para pruebas.

## Comisiones y disponibilidad de fondos

El panel privado `/admin/taller` incorpora la configuración de plazos/tarifas verificadas, el margen antes del evento y la recomendación del día. La API privada `/api/admin/taller/acreditacion-fondos` exige sesión y rol `configuration` para guardar o registrar cambios; `registration_operator` puede consultar. Ninguna ruta modifica por API la cuenta de Mercado Pago.

Las cuatro opciones de Checkout verificadas en esta cuenta son 35/18/10/0 días y 1,53%/3,48%/4,50%/6,45%, antes de IVA y retenciones, al 27/10/2026. El objetivo confirmado es 16/12/2026. La opción de 35 días ya fue guardada y comprobada en la cuenta; la base conserva la confirmación en `audit_log`.

El sistema recomienda automáticamente el plazo al consultar el plan; el panel lo actualiza cada minuto y al volver a la pestaña, sin reemplazar campos de tarifas que se estén editando. Registrar «ya configuré» deja evidencia y reconoce avisos vencidos, pero no reemplaza el cambio real en Mercado Pago. Verificar nuevamente condiciones en cada cambio. Los lotes/precios y los intentos de pago congelados son independientes de este calendario.

Los recordatorios por correo son optativos y **no quedaron activados en la base local**. El formulario exige confirmar que las tarifas provienen de la cuenta y seleccionar expresamente la preparación de avisos. Cancelar esa opción anula correos pendientes del plan. Los mensajes enviados no se duplican y no se reencola un envío en curso. La entrega futura requiere mantener el trabajador SMTP activo en el despliegue.

`node --env-file=.env --experimental-strip-types scripts/rebuild-settlement-reminders.mjs` solo muestra una vista previa y revierte la transacción. `--apply` prepara los mensajes futuros expresamente; no cambia Mercado Pago. Ver `docs/plan-disponibilidad-2026.md` para el calendario y sus límites.

## Correo local de prueba

El SMTP del buzón oficial está guardado en `.env.correos.local`, ignorado por Git y Docker, separado de las claves de Mercado Pago. Para cargar ambas configuraciones, usar `node --env-file=.env --env-file=.env.correos.local …`. No copiar claves en documentación.

`scripts/send-workshop-test-qr.mjs --reference REFERENCIA --to DESTINATARIO` prepara una vista previa sin enviar. Con `--send` verifica SMTP y procesa exclusivamente el correo QR de una inscripción sintética aprobada del entorno local de Mercado Pago. Reutiliza el procesador real de la cola y el QR ya emitido; no crea otro pago ni otro QR. Marca el mensaje como prueba sin validez para el evento, cancela la confirmación sintética redundante y no inicia un envío masivo. Si ya está enviado, no lo repite.

Se comprobó una entrega real en Gmail al organizador el 27/10/2026. Esto prueba este envío puntual; el trabajador continuo y su configuración en el despliegue aún requieren verificación antes de abrir al público.

## Administrador

`/admin` usa Better Auth con alta pública deshabilitada. La web pública responde 404 en `/admin`, `/api/admin/*` y `/api/auth/*`; el panel responde 404 en rutas públicas. En desarrollo, iniciar el panel como proceso separado con `APP_SURFACE=panel` y `BETTER_AUTH_URL` apuntando a su puerto local; en producción, solo después de configurar el perfil `panel` y su dominio HTTPS. Crear la primera cuenta **solo** en una base segura y desde consola interactiva: `pnpm exec auth create-admin --config ./scripts/auth-cli.ts --email TU_CORREO --name "Vamos al Santísimo" --role admin --data '{"username":"OPERADOR"}'`. La contraseña debe ingresarse en el prompt, nunca en argumentos o archivos. No existe contraseña predeterminada en el código. Después, vincular explícitamente la cuenta al rol operativo: `node --env-file=.env scripts/link-admin-operator.mjs --email TU_CORREO --role registration_operator` muestra una vista previa; repetir con `--apply` para guardar. Para cambiar precios y promociones, el vínculo debe tener rol `configuration` (no `registration_operator`). En Dokploy se usa el mismo script desde la terminal privada del contenedor `panel` (sin subir `.env`). Una cuenta local de desarrollo no crea automáticamente otra en producción. La vista privada permite aprobar o rechazar solicitudes de ayuda y, en `/admin/acreditacion`, verificar pagos manuales, emitir/reimprimir volantes y escanear ingresos. `/admin/taller` permite configurar lotes/promociones y crear pagos grupales; las operaciones registran operador, fecha y auditoría. La web integra Checkout Pro y conciliación de Orders en el entorno local de prueba; la publicación del webhook HTTPS sigue pendiente (ver `docs/checkout-pro.md`). No abrir las inscripciones reales antes de completar y probar el circuito completo.

Ver `docs/inscripciones.md` y `docs/despliegue-dokploy.md`. La contraseña de MySQL de 2025 expuesta históricamente debe rotarse; ese sistema heredado no es la base nueva.

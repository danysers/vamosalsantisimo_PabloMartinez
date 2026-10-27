# Configuración del taller 2026

No guardar secretos en Git ni enviarlos por chat. `.env` local está ignorado. **Todavía no se habilitaron inscripciones públicas ni cobros reales.**

## Variables

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL privado. En Dokploy debe usar el host `postgres` de la red `vas_workshop_private`. |
| `WORKSHOP_EVENT_SLUG` | `formacion-catolica-2026` para el taller sembrado. |
| `SITE_ORIGIN` | Origen HTTPS exacto de la web pública; controla solicitudes del formulario. Solo servicio `app`. |
| `REGISTRATION_EMAIL_READY` | `0` por defecto; `1` **solo después de verificar entrega SMTP real**. |
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

`compose.yaml` levanta PostgreSQL 16 en `127.0.0.1:54321` con volumen nombrado. Preparar un `.env` **local e ignorado** con `POSTGRES_PASSWORD`, `DATABASE_URL`, `WORKSHOP_EVENT_SLUG` y claves aleatorias. Luego: `docker compose up -d`, `node scripts/migrate.mjs`, `node scripts/seed-workshop.mjs`, `pnpm dev`. El seed carga los tres lotes ARS 10.000/15.000/20.000, alias y WhatsApp, pero deja inscripción, Mercado Pago, promociones y opciones de acreditación de fondos **inactivos**.

`pnpm test` compila automáticamente el código actual en `.next-test` y usa ese build para las pruebas HTTP, sin reemplazar una vista previa local abierta. Las pruebas de PostgreSQL requieren `DATABASE_URL` de una instancia **descartable y migrada**. No usar la base de producción para pruebas.

## Administrador

`/admin` usa Better Auth con alta pública deshabilitada. La web pública responde 404 en `/admin`, `/api/admin/*` y `/api/auth/*`; el panel responde 404 en rutas públicas. En desarrollo, iniciar el panel como proceso separado con `APP_SURFACE=panel` y `BETTER_AUTH_URL` apuntando a su puerto local; en producción, solo después de configurar el perfil `panel` y su dominio HTTPS. Crear la primera cuenta **solo** en una base segura y desde consola interactiva: `pnpm exec auth create-admin --config ./scripts/auth-cli.ts --email TU_CORREO --name "Vamos al Santísimo" --role admin --data '{"username":"OPERADOR"}'`. La contraseña debe ingresarse en el prompt, nunca en argumentos o archivos. No existe contraseña predeterminada en el código. Después, vincular explícitamente la cuenta al rol operativo: `node --env-file=.env scripts/link-admin-operator.mjs --email TU_CORREO --role registration_operator` muestra una vista previa; repetir con `--apply` para guardar. Para cambiar precios y promociones, el vínculo debe tener rol `configuration` (no `registration_operator`). En Dokploy se usa el mismo script desde la terminal privada del contenedor `panel` (sin subir `.env`). Una cuenta local de desarrollo no crea automáticamente otra en producción. La vista privada permite aprobar o rechazar solicitudes de ayuda y, en `/admin/acreditacion`, verificar pagos manuales, emitir/reimprimir volantes y escanear ingresos. `/admin/taller` permite configurar lotes/promociones y crear pagos grupales; las operaciones registran operador, fecha y auditoría. El panel aún no integra órdenes/webhooks reales de Mercado Pago. No abrir las inscripciones reales antes de completar y probar el circuito completo.

Ver `docs/inscripciones.md` y `docs/despliegue-dokploy.md`. La contraseña de MySQL de 2025 expuesta históricamente debe rotarse; ese sistema heredado no es la base nueva.

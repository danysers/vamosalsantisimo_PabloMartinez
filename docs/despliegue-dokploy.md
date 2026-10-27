# Despliegue separado en Dokploy

> Preparado para pruebas; no desplegado ni habilitado al público. El SMTP tiene valores no secretos configurados, pero la contraseña permanece fuera del repositorio. No hay credenciales de Mercado Pago.

## Arquitectura

- `deploy/dokploy-db.compose.yml`: **stack de PostgreSQL** con volumen persistente, sin puerto público.
- `deploy/dokploy-app.compose.yml`: **stack de aplicación** con migrador, web pública `app`, panel privado `panel` como contenedor independiente y trabajador de correo opcional. Los servicios comparten la red Docker externa `vas_workshop_private`; solo web y panel se conectan a `dokploy-network` para Traefik. El trabajador no expone puertos.
- `compose.yaml`: PostgreSQL **local** para desarrollo, distinto de los dos stacks de producción.

Antes del primer despliegue, crear una red privada Docker llamada `vas_workshop_private` en el mismo servidor y respaldar PostgreSQL. Configurar ambos Compose en Dokploy como **dos servicios independientes**. Desplegar primero la DB, esperar su healthcheck y recién después la app. En la app, conectar el dominio HTTPS público desde la interfaz de Dokploy al servicio `app`, puerto interno `3000`; no publicar PostgreSQL. `panel` queda bajo el perfil Compose opcional `panel` y **no se inicia ni tiene dominio configurado todavía**. Cuando se decida habilitarlo, definir `PANEL_ORIGIN` como su origen HTTPS, cargar un `BETTER_AUTH_SECRET` estable y activar el perfil `panel`; entonces conectar el futuro dominio solo al servicio `panel`, puerto interno `3000`. Nunca apuntar el dominio del panel al servicio público. La [documentación de dominios Compose de Dokploy](https://docs.dokploy.com/docs/core/docker-compose/domains) explica cómo agrega etiquetas/redes y recomienda comprobar **Preview Compose** antes de desplegar. La [documentación de autodeploy](https://docs.dokploy.com/docs/core/auto-deploy) indica que se habilita para el repositorio y rama seleccionados. No activar despliegue automático hasta verificar secretos, respaldo/restauración y migraciones en un entorno de prueba.

`DATABASE_URL` de app y panel debe apuntar al nombre DNS `postgres` de la red privada, no a `localhost`; usar la contraseña correspondiente al stack DB. Guardar secretos en el gestor de Dokploy, nunca en Git. `SITE_ORIGIN` pertenece **solo a la web pública**; `PANEL_ORIGIN`/`BETTER_AUTH_URL` pertenece **solo al panel** y debe ser un origen HTTPS distinto. Ambos contenedores usan la misma imagen, pero `APP_SURFACE` impide acceder a rutas administrativas desde la web pública y a páginas públicas desde el panel. Las demás claves requeridas por Compose están documentadas en `docs/configuracion.md`.

La migración se ejecuta antes de iniciar app/worker mediante `scripts/migrate.mjs`; el seed `scripts/seed-workshop.mjs` se ejecuta **una sola vez de manera controlada** después de migrar. Ese seed deja `registration_open=false`, `mercado_pago_enabled=false`, promociones y opciones de acreditación de fondos inactivas. No habilita cobros ni registra asistentes.

## Confirmación por correo oficial

El formulario real `POST /api/taller/inscripciones` guarda la ficha, el pago pendiente o solicitud de ayuda y las tareas de correo **en la misma transacción**: una confirmación al participante y, si pide ayuda, un aviso adicional al organizador. La respuesta idempotente repite la misma referencia, no crea otras tareas. El proceso `scripts/email-worker.mjs` toma la cola y envía desde `contactos@vamosalsantisimo.com`:

- Transferencia: importe, alias `danielservin.mp`, cuenta Mercado Pago, enlace al WhatsApp `3718 63-2884` para adjuntar manualmente el comprobante; indica que el pago continúa pendiente hasta revisión humana.
- Pago en el lugar: importe y estado pendiente hasta registro presencial.
- Inconvenientes para pagar: solicitud pendiente de revisión, sin prometer ingreso automático.
- En una solicitud de ayuda, se encola además un aviso al organizador configurado y se ofrece un enlace para avisarle por WhatsApp; ese enlace no envía el mensaje automáticamente. El panel privado `/admin` permite aprobar o rechazar una solicitud pendiente a un operador vinculado. El correo de decisión al participante se encola solo después de registrar esa revisión.
- Si el estado cambió antes de enviar la confirmación, puede informarse pago confirmado o exención aprobada según la base. La aprobación de ayuda tiene **su propio correo**, encolado solo después de revisar la solicitud. El QR personal se envía **en otro mensaje** y únicamente tras verificación/aprobación.

Los mensajes HTML siguen el modelo negro, dorado y blanco de Vamos al Santísimo, con logo, datos de los coordinadores y redes oficiales, **sin contacto del padre asesor**. El asunto y cuerpo Mercado Pago no anuncian plazos de acreditación. La vista previa `pnpm email:test --to CORREO --only assistance_approved` no envía nada; agregar `--send` envía solo ese mensaje ficticio.

El buzón oficial de DonWeb ya existe. El Compose usa por defecto `SMTP_HOST=a0151359.ferozo.com`, `SMTP_PORT=465` (SSL directo) y `SMTP_USER=contactos@vamosalsantisimo.com`; el remitente fijo es `SMTP_FROM=contactos@vamosalsantisimo.com`. El organizador confirmó que las variantes de prueba llegaron a Gmail. También se probó la cola con PostgreSQL descartable y transporte simulado; todavía falta comprobar el worker real en Dokploy. El DNS público muestra MX/SPF/DKIM/DMARC.

Al crear el servicio Compose de la aplicación en Dokploy:

1. Abrir **Environment / Variables de entorno** del servicio y cargar `SMTP_PASS` con el valor del `.env` local. Usar el campo de secreto si Dokploy lo ofrece. **No** subir el `.env`, copiar la clave al Compose ni incluirla en Git. Los valores `SMTP_HOST`, `SMTP_PORT` y `SMTP_USER` ya tienen valores por defecto en el Compose.
2. Mantener `REGISTRATION_EMAIL_READY=0` y el perfil `mail` desactivado durante el primer despliegue. Verificar que la aplicación y PostgreSQL estén sanos.
3. Para probar el envío, activar `COMPOSE_PROFILES=mail`, confirmar que `email-worker` arranca sin errores y realizar un envío controlado a una casilla de prueba. Confirmar recepción (no basta con ver `queued` en `email_outbox`); revisar fallas y reintentos.
4. Solo después de esa prueba poner `REGISTRATION_EMAIL_READY=1` y, en una operación separada y autorizada, abrir `workshops.registration_open`. Mientras la variable no sea `1`, la API devuelve 503 y **no persiste inscripciones**.

El correo de recordatorios de Mercado Pago se prepara para `danysers@gmail.com`, desde el mismo buzón oficial, pero no se enviará antes de configurar SMTP y opciones reales de acreditación.

El primer administrador se crea de forma interactiva según `docs/configuracion.md` **solo cuando exista el entorno de panel**. Después, en una terminal privada del contenedor `panel`, ejecutar `node scripts/link-admin-operator.mjs --email CORREO_ADMIN --role registration_operator` para previsualizar y repetir con `--apply` para vincularlo. La cuenta local de desarrollo no se copia a la base de producción. La API de decisiones exige sesión Better Auth `admin`, rol operativo habilitado y origen correcto. La aprobación de ayuda y la verificación manual de pago confirman la inscripción, emiten un QR único y encolan el volante por correo en la misma transacción; las decisiones quedan auditadas. `/admin/acreditacion` permite abrir el volante imprimible y leerlo con cámara o lector externo. El escáner está cerrado por defecto: `ADMISSION_SCAN_ENABLED=0`.

No usar pagos reales en pruebas. La ruta pública actual ofrece solo transferencia, pago en el lugar o solicitud de asistencia; Mercado Pago sigue deshabilitado hasta completar órdenes, webhook firmado y conciliación. El panel ya permite revisión de ayuda, confirmación manual de pagos, QR y escaneo, pero faltan configuración de precios/promociones, pagos grupales, integración real de Mercado Pago y pruebas operativas con cámaras/dispositivos y correo en el entorno de despliegue. Mantener cerradas las inscripciones hasta probar todo el circuito y el respaldo/restauración de datos.

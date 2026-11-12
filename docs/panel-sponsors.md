# Módulo de sponsors del panel

El panel `/admin/sponsors` permite a las cuentas con rol **Sponsor** crear y editar sponsors; ese rol solo ve este módulo. La cuenta operativa existente conserva su rol y recibe además `sponsor_access` cuando es la única cuenta activa enlazada durante la migración. Guarda en PostgreSQL el nombre de marca, titular, teléfono, correo y texto interno para el evento. Esos datos personales no se publican en la web. El logo se guarda tanto en la base del panel (para publicación inmediata) como en la carpeta fuente de Drive (archivo y generación de flyers).

## Flujo del logo y flyers

El alta del panel sube el logo a la carpeta de Drive `sponsors-2026` y guarda una copia en la base privada. La web pública consulta exclusivamente el feed de logos del panel y ya no sondea Drive para la galería; una pestaña abierta refresca cada 15 segundos. El timer Oracle `vas-flyers.timer` **sigue leyendo Drive** para detectar cambios en su próxima revisión (cada cinco minutos), reutiliza el generador actual, conserva las plantillas y regiones protegidas, y sube los nuevos flyers y su manifiesto a la carpeta de destino de Drive. La generación puede tardar más que el intervalo de revisión. La web pública sigue sincronizando los **flyers generados** desde Drive hasta sustituir ese canal; el servicio del panel no inicia `sponsor-sync-worker`.

## Configuración privada necesaria

La instancia `Panel privado Taller 2026` debe poder crear archivos en la carpeta autorizada. Configurar allí, en Dokploy y como variables privadas, las mismas credenciales OAuth de Drive que usa el proceso autorizado del proyecto:

```text
DRIVE_OAUTH_CLIENT_ID=...
DRIVE_OAUTH_CLIENT_SECRET=...
DRIVE_OAUTH_REFRESH_TOKEN=...
SPONSOR_DRIVE_FOLDER_ID=1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68
SPONSOR_DRIVE_OWNER_EMAILS=vamosalsantisimof@gmail.com,danysers@gmail.com
```

La cuenta OAuth debe tener permiso para crear y actualizar archivos en esa carpeta y pertenecer a la lista de propietarios autorizados. No copiar valores a Git ni enviarlos por chat. Si faltan las variables, el panel devuelve un error de integración y no confirma la carga.

Las migraciones `0040_sponsor_admin.sql` y `0041_sponsor_delivery.sql` crean la tabla, el rol Sponsor, el permiso adicional y el almacenamiento privado del logo. Aplicarlas a la base del panel antes de habilitar la página; usar el procedimiento de migraciones del servicio y verificar el respaldo antes de desplegar. Si hay más de una cuenta activa enlazada, la migración no asigna automáticamente el permiso a ninguna: verificar y asignarlo manualmente a la cuenta correcta. El feed público del panel solo expone marca y logo, nunca datos personales. La aplicación se construye desde la rama `main` del repo que publica la imagen GHCR.

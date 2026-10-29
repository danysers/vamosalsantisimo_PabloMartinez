# Auspiciantes de la portada

La portada real es `public/pagina principal con efecto/index.html` (reescritura de `/`). Mila Club permanece destacado arriba; Alma Verde, Cabildo y Las Kalas permanecen como archivos locales. Los demás logos se agregan debajo en una cuadrícula de cuatro columnas en escritorio y dos en móvil.

## Alta automática desde Google Drive

El trabajador `scripts/sponsor-sync-worker.mjs` revisa cada cinco minutos la carpeta `1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68`. Copia imágenes PNG, JPG o WebP de hasta 4 MiB a un caché local, valida tipo, firma y checksum, y publica un manifiesto atómico. El nombre visible surge del nombre del archivo, sin extensión. La portada consulta `/api/sponsors` al abrirse, al volver a la pestaña y cada cinco minutos; si Drive falla, los cuatro logos originales siguen apareciendo.

La carpeta actualmente permite editar a cualquiera que tenga el enlace. Para impedir que un tercero publique imágenes arbitrarias, el trabajador solo admite archivos cuyo propietario esté en `SPONSOR_DRIVE_OWNER_EMAILS` (lista separada por comas). Por defecto se permiten las dos cuentas conocidas del proyecto: `vamosalsantisimof@gmail.com` y `danysers@gmail.com`. Si se sube desde otra cuenta, incluirla explícitamente en la lista privada tras verificarla o subir desde una de las cuentas admitidas. Conviene restringir el acceso de edición de la carpeta antes de publicar.

El enlace a la carpeta **no autoriza al contenedor**. En las variables privadas del servicio web de Dokploy (no en Git) configurar:

```text
SPONSOR_SYNC_ENABLED=1
SPONSOR_DRIVE_FOLDER_ID=1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68
SPONSOR_DRIVE_OWNER_EMAILS=vamosalsantisimof@gmail.com,danysers@gmail.com
DRIVE_OAUTH_CLIENT_ID=...
DRIVE_OAUTH_CLIENT_SECRET=...
DRIVE_OAUTH_REFRESH_TOKEN=...
```

Las tres variables OAuth usan el mismo mecanismo que el trabajador de comprobantes, pero requieren una cuenta autorizada para leer esta carpeta y un token con alcance suficiente. La conexión de Google Drive de Codex no se transfiere a Dokploy. En el diagnóstico inicial del 29/10/2026 faltaban esas credenciales; la conexión y el procedimiento de activación se documentan en [integracion-drive-2026-10-29.md](integracion-drive-2026-10-29.md). El caché predeterminado usa el directorio temporal del contenedor: se reconstruye tras un reinicio, y con más de una réplica habría que usar un volumen compartido. El servicio actual tiene una réplica.

## Acceso público

El usuario y la contraseña de la web pública procedían de `Advanced > Security` de la aplicación `Página Pablo Martínez` en Dokploy (Traefik Basic Auth), no de Next.js. Se retiraron el 28/10/2026 por confirmación expresa del organizador; una petición anónima a la portada pasó de HTTP 401 a HTTP 200. **No confundir esta protección con la del panel**, que mantiene su autenticación independiente. La aplicación todavía usa Mercado Pago TEST y muestra un alias/QR de transferencia que puede recibir dinero real.

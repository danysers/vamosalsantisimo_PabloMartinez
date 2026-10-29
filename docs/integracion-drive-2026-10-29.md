# Comprobantes y sponsors: conexión con Drive

## Diagnóstico del 29/10/2026

El servicio público tenía los trabajadores implementados, pero faltaban las tres credenciales OAuth, los identificadores de carpeta y los indicadores de activación. Tres comprobantes estaban conservados en PostgreSQL, con metadatos completos y cero intentos de copia. La galería respondía `available: false`; ambas carpetas de Drive estaban vacías. El enlace compartido y la conexión de Drive de Codex no autorizan al contenedor.

Se creó el proyecto dedicado de Google Cloud `vamos-al-santisimo-drive`, se habilitó Drive API y se registró la aplicación «Vamos al Santisimo - Taller». El titular autorizó la política de Google y, por separado, el acceso offline de la aplicación a su cuenta. Se usa `drive.readonly` para leer las imágenes cargadas fuera de la aplicación y `drive.file` para crear y administrar sus propias copias; `openid` y el correo verifican la cuenta autorizante. No se solicitó escritura general de Drive.

La aplicación OAuth tiene estado **En producción** para evitar la caducidad de siete días del modo de prueba. La conexión se utiliza únicamente por la organización, no como acceso con Google para los asistentes. Sigue siendo una aplicación propia sin verificación pública de Google. Su información de uso está en `/integracion-drive/index.html`, con privacidad y condiciones específicas. Las credenciales se conservan fuera de Git y del navegador público.

## Destinos y variables privadas

Solo en la aplicación pública `Página Pablo Martínez` de Dokploy:

```text
DRIVE_OAUTH_CLIENT_ID=<privado>
DRIVE_OAUTH_CLIENT_SECRET=<privado>
DRIVE_OAUTH_REFRESH_TOKEN=<privado>
DRIVE_FOLDER_ID=19XHhJ2yxNBhRxNdq2eUIT96RbRy1dfcr
DRIVE_ALLOW_LINK_SHARING=1
WORKSHOP_DRIVE_WORKER_ENABLED=1
SPONSOR_SYNC_ENABLED=1
SPONSOR_DRIVE_FOLDER_ID=1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68
SPONSOR_DRIVE_OWNER_EMAILS=vamosalsantisimof@gmail.com,danysers@gmail.com
```

No activar estos trabajadores en la aplicación del panel. Preservar el resto de las variables, incluidos correo y Mercado Pago. Probar la autorización antes de habilitar los indicadores, guardar una copia privada de la configuración anterior y redesplegar el servicio público con la imagen aprobada por CI.

Las carpetas ya admitían edición mediante enlace; no se modificaron sus permisos. La excepción de comprobantes corresponde al destino expresamente aceptado por la organización. Los permisos de Drive controlan quién puede ver esas copias. El sincronizador de sponsors solo incorpora imágenes de las cuentas propietarias permitidas.

## Verificación de copias

La prueba con un PNG ficticio confirmó que Drive puede omitir `parents` en las respuestas aun cuando el archivo se creó en la carpeta correcta con estos permisos. El trabajador ahora verifica la pertenencia mediante una consulta que exige simultáneamente la carpeta, `trashed = false` y la propiedad privada `paymentProofId`; el identificador debe coincidir con la carga. Solo entonces registra la copia como sincronizada en PostgreSQL. No basta con recibir una respuesta de carga correcta.

Los reintentos reutilizan una copia encontrada mediante esa misma consulta. Las respuestas ambiguas, los nombres inesperados o una copia que no aparezca en el destino no se marcan como éxito. Las pruebas cubren estas condiciones y la ausencia del campo `parents`.

Para comprobar el cierre operativo, verificar los identificadores y fechas de sincronización de los comprobantes pendientes y la presencia de sus copias en la carpeta. La prueba técnica usa datos ficticios y se mueve a la papelera al terminar. No necesita crear inscripciones, órdenes de pago ni pagos.

## Alta de sponsors

Cargar PNG, JPG o WebP de hasta **4 MiB** desde una de las dos cuentas autorizadas en `sponsors-2026`. El trabajador consulta Drive cada cinco minutos. La portada actualiza al abrirse, al volver a la pestaña y cada cinco minutos: una pestaña que permanece abierta puede tardar hasta diez minutos en reflejar una carga nueva. El nombre del archivo, sin extensión, identifica la marca.

Se corrigió también la actualización de un archivo con el mismo identificador de Drive cuando cambia la imagen o el nombre. Al retirar un archivo, desaparece de la galería sincronizada; Mila Club, Alma Verde, Cabildo y Las Kalas permanecen como marcas locales. `/api/sponsors` debe responder `available: true` una vez que el trabajador haya publicado su manifiesto, aunque la carpeta todavía no tenga imágenes.

La generación automática de flyers queda fuera de este trabajo.

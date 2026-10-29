# Revisión de seguridad — 29/10/2026

Alcance: repositorio vamosalsantisimo_PabloMartinez, portada estática, páginas React, taller, API pública, panel, comprobantes, integraciones y publicación. Revisión de código y pruebas de regresión; no es una garantía de ausencia de vulnerabilidades ni un pentest de la infraestructura completa.

## Correcciones

- Cabeceras comunes: HTTPS persistente (sin imponerlo a otros subdominios), bloqueo de framing, MIME estricto, política de referencias y permisos del navegador. Cámara y ubicación quedan limitadas al mismo origen para conservar acreditación y mapas.
- CSP de páginas estáticas: scripts locales y YouTube, hashes calculados del contenido de los scripts inline versionados; se bloquean manejadores HTML y scripts arbitrarios. Normalización de saltos de línea para coincidir con el navegador.
- CSP de páginas React y panel: nonce criptográfico por respuesta, sobrescribe valores enviados por el cliente. Scripts de transición reciben el nonce; respuestas dinámicas sin caché compartida. Se conservan las políticas más restrictivas de comprobantes y volantes.
- Autenticación: cuerpo JSON limitado a 16 KiB antes de invocar Better Auth. Lectores de JSON y multipart cancelan el flujo cuando excede el tamaño permitido.
- Dependencia indirecta esbuild anterior a 0.25.0 reemplazada por 0.25.12: GHSA-67mh-4wv8-2f99 (servidor de desarrollo). Lockfile actualizado sin actualizar indiscriminadamente las dependencias.
- Workflow de regresión con PostgreSQL descartable y auditoría de dependencias, obligatorio antes de publicar la imagen; no usa secretos ni datos de producción.

## Validación

- Compilación de producción, TypeScript y ESLint correctos.
- Suite completa con PostgreSQL descartable: 137 pruebas, 136 correctas, ninguna fallida y una omitida (escenario administrativo heredado que requiere bootstrap manual). El nuevo caso autónomo verifica login, cookie HttpOnly/SameSite, rechazo de cierre de sesión desde otro origen y revocación efectiva de la sesión.
- Auditoría de dependencias completa: cero vulnerabilidades conocidas reportadas al 29/10/2026, incluyendo desarrollo y dependencias opcionales.
- Pruebas HTTP de hashes y nonces en portada, taller, páginas React y panel, bloqueo entre superficies y tamaño máximo de autenticación.
- Navegador real: portada con YouTube y formulario del taller interactivo sin errores CSP registrados.
- El caso de inscripción ahora genera su propia clave criptográfica descartable; antes dependía de una variable externa ausente y fallaba con 503 en una base nueva.
- Los dominios activos comprobados antes de publicar son pablomartinez.vamosalsantisimo.com y paneltaller2026.vamosalsantisimo.com. www.vamosalsantisimo.com y su ruta /taller respondían 404; no pertenecen a los dominios vinculados a estas dos aplicaciones en Dokploy.

## Controles revisados

Separación public/panel cerrada por defecto, sesiones y roles consultados en servidor, control de Origin en operaciones del panel, alta pública deshabilitada, cookies seguras, límites de autenticación, consultas parametrizadas, tokens de acceso comparados en tiempo constante, QR opacos cifrados con AES-GCM, firma y verificación remota de pagos, deduplicación de notificaciones, recuperación con vencimiento/intentos, comprobantes limitados a 5 MiB y tres por intento, acceso privado a archivos, validación de identidad y formato de imágenes de auspiciantes, destinos externos fijos y ausencia de claves privadas/tokens reconocibles en los archivos versionados examinados.

## Límites y operación

- El escaneo de secretos por patrones cubre el árbol versionado actual; no acredita que todo el historial Git esté libre de secretos. Si hubo claves publicadas históricamente, deben revocarse en el proveedor.
- Las contraseñas elegidas deben cambiarse por el titular mediante un canal privado; no se rotan automáticamente para evitar perder acceso.
- No se ejecutaron pagos, envíos de correo ni cambios de permisos de Drive como parte de las pruebas.
- Las políticas de Cloudflare, permisos de cuentas externas, restauración ante desastre y reglas de red requieren seguimiento propio. La seguridad también depende de mantener dependencias, accesos y respaldos actualizados.
- CSP permite estilos inline para estilos React y animaciones; no permite scripts inline arbitrarios en las páginas revisadas.

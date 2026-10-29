# Revisión adicional de ataques — 29/10/2026

La revisión anterior de `pnpm audit` cubría las dependencias del proyecto. Esta ampliación examina además el contenedor completo, intenta saltar controles con solicitudes adversas y agrega pruebas antes de publicar. No acredita protección frente a cualquier ataque posible ni vulnerabilidades todavía desconocidas.

## Controles y correcciones

| Área | Evidencia y protección |
| --- | --- |
| SQL injection | Consultas parametrizadas con Drizzle/pg; sin `sql.raw` con entradas de usuarios. Validación estricta de cuerpos, nombres, documentos, referencias y UUID. Intento de inyección en login rechazado. |
| XSS | React escapa texto; correos escapan HTML. CSP con hashes/nonces, sin manejadores HTML inline. Prueba de texto con `<img onerror>` y enlace `javascript:`: queda escapado. |
| Fuerza bruta | Better Auth y adaptador Drizzle 1.7.7 con contador atómico PostgreSQL. Usuario y correo admiten como máximo 5 intentos por minuto y ruta. Sin proxy verificado se comparte el contador, en lugar de confiar en IP declarada por el solicitante. Se agrega `Retry-After` estándar a los 429. |
| IP falsa y concurrencia | `trustedProxyHeaders: false` solo protegía host/protocolo; no elegía las cabeceras usadas para el rate limit. Se configura explícitamente `ipAddressHeaders`. Con `TRUST_REVERSE_PROXY=0` ignora X-Forwarded-For, X-Real-IP y CF-Connecting-IP. Pruebas simultáneas con cabeceras distintas verifican el límite. |
| Rate limit público | Contadores globales persistentes y atómicos, independientes de token/IP/referencia: 30 cargas de comprobantes/minuto, 60 cambios de medio/minuto y 3000 consultas de estado/minuto. Respuesta 429 con Retry-After 60. Cargas se limitan antes de leer el archivo. Inscripción conserva techo global de 500/10 minutos y límite opcional por IP confiable. |
| Recuperación | Tres solicitudes por identificador en 15 minutos; cinco intentos por desafío, vencimiento y consumo único; respuestas sin revelar existencia de una inscripción. Techos globales persistentes. |
| Archivos | Máximo 5 MiB por comprobante, límite multipart en bytes reales, firmas PNG/JPEG/WebP/PDF, rechazo de HTML/SVG aunque cambie la extensión, token de acceso y tres comprobantes por pago. Comprobantes privados requieren sesión/rol; descarga con MIME fijo, nosniff y sandbox. Pruebas de token incorrecto, archivo disfrazado y tamaño excesivo. No hay antivirus/CDR ni se afirma que la firma de formato detecte todo contenido malicioso. |
| Descargas de auspiciantes | Propietario/carpeta de Drive verificados, formatos raster, checksum y tamaño. Nuevo lector con límite mientras descarga y cancelación; cubre respuestas chunked o Content-Length falso. |
| SSRF/optimización | Next solo optimiza rutas `/2026/**` y `/_next/static/media/**`, sin query, sin destinos remotos y sin redirecciones. Se mantiene SVG deshabilitado. Pruebas rechazan localhost, metadata cloud y rutas API privadas; optimizar el logo público sigue funcionando. |
| Sesiones, CSRF y roles | Origen exigido en mutaciones, cookies HttpOnly/SameSite y Secure en HTTPS; roles comprobados en servidor, bloqueo de operadores suspendidos, registro público cerrado. La prueba incluye cierre desde otro origen rechazado y revocación de sesión. |
| Pagos | Firma del webhook, identidad del vendedor/aplicación/entorno, consulta a proveedor, cotización guardada e idempotencia; el navegador no decide que un pago fue aprobado. No se hicieron cobros reales en estas pruebas. |
| Secretos | Escaneo por patrones de alta confianza sobre los 50 commits alcanzables: sin claves privadas, tokens GitHub/AWS/Mercado Pago detectados. No es una prueba exhaustiva de ausencia de secretos. No se guardaron credenciales en los cambios. |

## Avisos oficiales comprobados

- [Next.js, 14/10/2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026): los parches son 16.4.1/15.5.28; este repo usa **16.4.2**, con **sharp 0.35.5**. Incluye correcciones de ejecución remota y denegación de servicio. React instalado: **19.3.1**.
- [Node.js, 21/10/2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): la línea 22 se corrige en **22.23.4**, versión fijada en construcción y runtime. Se conserva ese binario al reducir la imagen.
- [Better Auth/Drizzle, concurrencia](https://github.com/better-auth/better-auth/security/advisories/GHSA-44jh-23m7-hpcf): ambos paquetes están en **1.7.7**, versión corregida. Las pruebas verifican el comportamiento, además de comparar versiones.

## Imagen de producción y publicación

Trivy 0.74.0 encontró en la imagen anterior 93 hallazgos HIGH/CRITICAL por paquete (47 identificadores distintos): 57 en paquetes Debian, 10 en npm y 26 en el binario Go de esbuild. Estos números no significan 93 ataques explotables desde la web; mostraron componentes innecesarios que `pnpm audit` no examina.

La nueva imagen usa [Distroless cc Debian 13](https://github.com/GoogleContainerTools/distroless), fijada por digest, y el binario Node 22.23.4. No incluye shell, npm ni los compiladores opcionales esbuild/Drizzle CLI. Ejecuta como UID 65532. Solo la caché de Next y el área temporal necesaria son escribibles para el proceso.

Validación local: 142 pruebas, 141 correctas, 0 fallidas y 1 escenario administrativo legado omitido; TypeScript/ESLint y auditoría completa de dependencias correctos. Imagen reducida: **0 HIGH/CRITICAL** en el escaneo. Smoke de imagen: migraciones, portada/taller, imágenes nativas, autenticación, imports de workers, ejecución sin root y ausencia de shell/npm.

El escaneo adicional de severidades menores de la imagen local registra **23 MEDIUM y 8 LOW**, sin versión corregida informada por la base de Trivy para esos paquetes Debian. No se ocultaron ni se consideran resueltas. Cero HIGH/CRITICAL no significa cero vulnerabilidades.

El commit `c21cfcb7ca63cc02e51009c70afbffa24850d70f` pasó el [pipeline 40895930096](https://github.com/danysers/vamosalsantisimo_PabloMartinez/actions/runs/40895930096): 141 pruebas correctas, ninguna fallida, una omitida, auditoría completa, smoke de la imagen ARM64 y bloqueo Trivy HIGH/CRITICAL. Ambos despliegues Dokploy terminaron correctamente el 29/10/2026, a las 14:58 y 14:59 UTC. La portada y `/admin` respondieron 200 con CSP; el optimizador rechazó destinos no autorizados y consultas añadidas al logo, y entregó el logo permitido. La API de auspiciantes respondió 200 con su alternativa estática (`available: false`); esto no acredita una sincronización de Drive en producción.

El pipeline ahora construye y carga la imagen, ejecuta el smoke sobre esa misma imagen, la escanea y solo entonces publica `latest`. Una alerta HIGH/CRITICAL bloquea la publicación y requiere revisión; no hay exclusiones para ocultar hallazgos.

## Límites operativos

- Los techos globales evitan multiplicar contadores con IP falsas y reducen carga costosa; quien los agote puede causar rechazos temporales a usuarios legítimos. No son una defensa completa frente a DDoS o saturación de conexiones/ancho de banda.
- No se certificaron reglas WAF/bot/rate limiting de Cloudflare, seguridad del host Dokploy ni servicios ajenos a este repo. El servidor y el panel de despliegue requieren su propia actualización.
- MFA no está configurado. Para cuentas administrativas conviene enrolar un segundo factor y reemplazar contraseñas compartidas mediante un canal privado; estas pruebas no rotan credenciales ni bloquean al titular.
- No se ejecutó una prueba de carga ni una explotación destructiva en producción. Los intentos de abuso se ejecutaron con PostgreSQL descartable y datos ficticios.
- Una auditoría sin alertas refleja las bases consultadas en esa fecha. Las imágenes fijadas por digest y las dependencias deben volver a evaluarse cuando aparezcan avisos nuevos.

# Voluntarios y donaciones

Sección `#colabora` antes de las marcas en la portada. Páginas `/voluntarios` y
`/donaciones` con el fondo negro, curvas y partículas doradas del sitio.

La inscripción de voluntarios se realiza mediante el grupo de WhatsApp
proporcionado por la organización. La página explica el servicio antes,
durante y después del evento, la formación, la coordinación y la oración.
No almacena datos ni confirma altas en nombre de WhatsApp.

La página de donaciones muestra los datos entregados por la organización en
`lib/community-support.ts`, debajo del QR. El alias se copia literalmente.
El QR está rotulado como prueba y codifica exclusivamente
`https://example.org/donacion-prueba`; no está vinculado a Mercado Pago.
Se genera con `node scripts/generate-donation-demo-qr.cjs` y debe sustituirse
por el QR aprobado cuando la organización lo entregue.

La transición compartida admite Inicio, Formación, Voluntarios y Donaciones.
Escucha el clic en captura para conservar el fundido en enlaces de Next.js,
mantiene enlaces modificados y respeta movimiento reducido y BFCache.

Verificación: TypeScript, ESLint, HTTP 200 en páginas y PNG, navegación en
el navegador de inicio a voluntarios y donaciones, destino del enlace del
grupo y confirmación real del botón Copiar alias.

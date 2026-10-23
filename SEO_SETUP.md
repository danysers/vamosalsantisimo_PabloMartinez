# Publicación y SEO de la edición 2026

La versión actual **no está publicada ni aprobada para indexación**. `robots.txt` impide rastreo y el layout entrega `noindex`; `/sitemap.xml` no anuncia el dominio viejo. No se incluyen datos estructurados mientras el lugar completo, disponibilidad y material promocional no estén confirmados.

## Antes de habilitar buscadores

1. Confirmar dominio HTTPS, dirección de María Auxiliadora y lugar del taller, programas, imágenes y redes oficiales; autorizar contenidos.
2. Completar `APP_URL` en la infraestructura, definir canónica y OG con imagen aprobada. Generar sitemap solo con URLs públicas definitivas; excluir inscripciones y administración.
3. Verificar HTTPS, contenido visible, experiencia móvil y datos reales; recién entonces revisar `robots.txt` y `metadata.robots` para permitir indexación.
4. Validar Search Console con la organización; no usar el dominio, cifras ni testimonios de la edición 2025 para describir 2026.

Los PNG seleccionados se entregan como WebP en `public/2026` (~920 KB en total). Next.js optimiza además las imágenes insertadas con `next/image`; los fondos CSS usan los WebP directamente. Estos recursos públicos tienen caché de 24 horas y `stale-while-revalidate` de 7 días, no caché anual inmutable porque las imágenes conceptuales podrían reemplazarse. Ninguna respuesta de inscripción o consulta privada usa caché compartida (`Cache-Control: no-store`). Verificar estas cabeceras y tamaño de transferencia tras definir CDN/hosting.

El archivo anterior describía Daniel Poli y un evento finalizado en 2025: esa información no aplica a este evento.

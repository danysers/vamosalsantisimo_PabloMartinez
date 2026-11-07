# SEO público y calidad de imágenes

La URL canónica es `https://vamosalsantisimo.com`. El dominio de Pablo continúa
sirviendo el sitio, con las mismas canónicas. No se redirigen sus enlaces personales
ni se modifican los retornos de pagos. La navegación HTTP se lleva a HTTPS según
el esquema externo comunicado por Cloudflare; los POST y el transporte HTTP interno
del túnel no se alteran.

`lib/site-seo.mjs` define títulos, descripciones, canónicas y datos estructurados
de las ocho páginas públicas. Para actualizar las cabeceras HTML estáticas:

```sh
node scripts/prepare-seo.mjs
node scripts/prepare-seo.mjs --check
```

El build también las genera. Las tres páginas React de colaboración usan esos
mismos datos. Sitemap y robots permiten descubrir las páginas y renderizar los
recursos. Administración, APIs privadas, pagos, acreditaciones y comprobantes
mantienen su exclusión de los buscadores. El sitemap no contiene enlaces personales.

Los eventos publican el 19 de diciembre de 2026: adoración a las 19 h y taller a
las 15 h. No se inventan precios del taller, cupos ni horarios de finalización.
El cambio de sede por lluvia actualiza también los datos estructurados del inicio.

## Preservación de imágenes

Por decisión del propietario, la calidad visual tiene prioridad sobre la puntuación
de rendimiento. Las variantes WebP se generan **sin pérdida, sin recortar y a la
resolución original** con `node scripts/generate-web-images.mjs`. Su prueba compara
las dimensiones, el canal alfa y cada color visible con los PNG originales.
Las fotos JPEG y las descargas de flyers mantienen sus archivos originales.
No se alteran los recursos ni las plantillas de la automatización de Hermes.

Las imágenes fuera de pantalla se descargan al aproximarse a la vista. La invitación
conserva el flyer local como respaldo y cambia a la versión de Drive cuando los dos
formatos están listos. El cargador diferido no reemplaza una versión más reciente.
Los archivos derivados llevan fecha en la URL para poder usar caché inmutable.
Si cambia un original, hay que cambiar también el nombre de su variante y sus
referencias antes de publicar; no se debe sobrescribir una URL con caché inmutable.

## Validación y seguimiento

`pnpm test` verifica los metadatos, canónicas, sitemap, separación del panel, enlaces
privados, calidad sin pérdida y la carga de sponsors/flyers. CI también ejecuta las
regresiones de pagos con una base desechable y comprueba la imagen de producción.

La línea base móvil de Lighthouse 13.6.0 sobre producción estable fue:

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| --- | ---: | ---: | ---: | ---: |
| Inicio | 69 | 100 | 92 | 92 |
| Taller | 74 | 100 | 92 | 100 |

Los resultados posteriores deben medirse sobre producción, con la misma versión
y configuración móvil, sin builds locales simultáneos. La simulación de red lenta
penaliza las imágenes originales grandes; no se debe reducir su calidad para
mejorar artificialmente esa puntuación.

Después de publicar, conviene enviar `/sitemap.xml` en Google Search Console e
inspeccionar las URLs públicas. Una prueba técnica de SEO no mide la posición en
Google ni garantiza una fecha de indexación. Las canónicas son señales para Google;
no eliminan de inmediato las copias ya conocidas del dominio anterior.

# Flyers del taller — 10 propuestas

## Revisión minimalista solicitada

La carpeta `minimal/` contiene la iteración preferida por el usuario: diez PNG de 1080 × 1350 px, diez SVG editables, `comparativa-minimal.png`, un ZIP con los PNG, `qr-taller.png` y su generador. Utiliza la fotografía original completa en la parte superior y escribe en el espacio vacío de la izquierda; no agrega colores ajenos a la imagen, marcos, tarjetas ni degradados. Por pedido posterior del usuario, incluye el logo dorado original en el sector inferior derecho.

Las diez piezas muestran la web del taller, QR, Instagram/Facebook `@vamosalsantisimof`, TikTok `@vamosalsantisimo` y el contacto **3718 63-2884** para información e inscripción. El QR apunta a `https://pablomartinez.vamosalsantisimo.com/formacion`. Esa URL respondió 401 durante la comprobación del 26 de octubre de 2026; el usuario indicó que se use igual por ahora y que la cambiará después. Para regenerar con la URL definitiva, establecer `FLYER_URL` con una URL HTTPS antes de ejecutar `minimal/generate.cjs`.

Las diez propuestas iniciales se conservan abajo solo como referencia de la iteración anterior.

- `comparativa.png`: vista de las diez versiones.
- `version-01.png` a `version-10.png`: piezas listas para revisar, de 1080 × 1350 px.
- `version-01.svg` a `version-10.svg`: fuentes vectoriales editables con la fotografía incluida.
- `flyers-taller-10-versiones.zip`: las diez versiones PNG.
- `generate.cjs`: generador reproducible, usando la fotografía original `public/formacion/assets/pablo-martinez.png`.

## Datos utilizados

Sábado 19 de diciembre de 2026, 17:00 h, con Pablo Martínez. Lotes de referencia: ARS 10.000, 15.000 y 20.000 (`lib/registration-policy.ts` y `docs/inscripciones.md`). La sede exacta y la apertura de la inscripción siguen pendientes. No se inventan fechas de activación de lotes.

El archivo `public/formacion/assets/logo-dorado.png` no es un logo exclusivo del taller: incluye el nombre y símbolo del encuentro general. Para respetar la indicación de evitar esa referencia, estas propuestas usan una marca musical tipográfica propia del taller. Se puede reemplazar por un logo específico cuando esté disponible.

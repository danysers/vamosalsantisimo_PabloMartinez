Taller integrado — 23 de octubre de 2026

Origen: C:/Users/danys/OneDrive/Documentos/ChatGPT/Pagina vamos al santisimo pc casa/vamosalsantisimo_web/dist/formacion
Copia de trabajo: public/formacion (incluye las siete páginas, imágenes y fuentes).
Entrada: /formacion, desde el tercer botón de GoldenHero.
Las páginas HTML se sirven por rewrites explícitos en next.config.mjs.
Los enlaces copiados usan las rutas sin barra final que maneja Next.js.

La navegación interna del taller conserva app.js y sus fundidos originales.
El paso portada/taller usa page-transition.js y page-transition.css compartidos:
salida de 280 ms, velo oscuro cálido, espera acotada de fuentes y retrato,
entrada de 560 ms con desenfoque leve. Funciona también al regresar a Inicio.
Respeta movimiento reducido, enlaces modificados, nuevas pestañas y BFCache.
Sin JavaScript los enlaces siguen funcionando. La inscripción sigue siendo
solo frontend y muestra que los datos todavía no se enviaron.

Verificado: siete rutas HTML y recursos HTTP 200; TypeScript y ESLint;
recorrido en navegador portada -> taller -> inscripción -> portada.

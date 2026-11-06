# Kit completo del flyer “Vamos al Santísimo”

Esta carpeta reúne el arte final vertical para Instagram, los archivos editables y los recursos exportados por separado. El archivo maestro de la pieza es Flyer-final-editable.svg: ahí están las posiciones en píxeles, textos, tipografías, degradados, transparencias, sombras, líneas y partículas.

## Entregables

- **Flyer-final-historia.png**: imagen final, 1080 × 1920 px.
- **Flyer-final-editable.svg**: SVG editable con la composición completa.
- **assets/logo.png**: emblema Vamos al Santísimo.
- **assets/host.png**: recorte PNG transparente de la custodia/Santísimo aprobado para el flyer.
- **assets/pablo.png**: recorte PNG transparente de Pablo Martínez. La cara de la foto original no se retocó.
- **assets/mila.png**: logo de Mila Club, sponsor principal.
- **assets/alma.png**, **assets/cabildo.png**, **assets/kalas.png**: logos de auspiciantes secundarios.
- **assets/qr-vamosalsantisimo-100.png**: QR aislado, 100 × 100 px, apunta a https://www.vamosalsantisimo.com.
- **assets/iconos-redes/instagram.png**, **facebook.png**, **tiktok.png**: iconos dorados aislados, PNG con transparencia, lienzo 96 × 96 px cada uno.
- **assets-manifest.json**: dimensiones y canales alfa de los recursos.
- **sponsors.json**: inventario de los logos actuales, coordenadas aprobadas, medida de Mila Club y regla de filas para auspiciantes nuevos.
- **exportar-kit.cjs**: script que vuelve a reunir los recursos y exporta los iconos y el QR desde el SVG maestro.

Los logos se deben usar conservando los píxeles originales: no estirar, redibujar, recolorear ni recortar. El canal alfa del PNG indica que admite transparencia; no implica que cada píxel exterior o fondo interno sea transparente. La apariencia exacta de cada logo está preservada en su archivo.

## Documento y escala

El canvas mide 1080 × 1920 px. El viewBox del SVG es 0 0 1080 1920 y se rasteriza a escala 1:1. Las posiciones x e y que siguen son píxeles SVG. En texto, y es la línea base, y text-anchor define si x alinea el comienzo, el centro o el extremo derecho. El motor de tipografía determina el avance exacto de los glifos con las fuentes especificadas. Para colocación idéntica, conservar los textos SVG y sus estilos del maestro.

Familias usadas: Georgia con Times New Roman como alternativa serif; Arial con Helvetica y sans-serif como alternativas. No sustituir las fuentes si se busca igualar el espaciado.

## Texto y posiciones

| Texto | Coordenada | Alineación | Tipografía | Relleno |
|---|---|---|---|---|
| SÁBADO · 19 DE DICIEMBRE · 2026 | x=1030, y=38 | derecha | Georgia, 28 px, normal, tracking 0.2 px | #f4e7cb |
| Más información | x=980, y=178 | centro | Arial, 15 px, peso 600, tracking 0.7 px | #d6be8d |
| VAMOS AL | x=60, y=225 | izquierda | Georgia, 82 px, normal, tracking −1.3 px | #f7e6c2 |
| SANTÍSIMO | x=60, y=300 | izquierda | Georgia, 82 px, normal, tracking −1.3 px | gradiente gold |
| INVITADO ESPECIAL | x=785, y=252 | centro | Arial, 30 px, peso 600, tracking 2 px | #bca87f |
| Pablo Martínez | x=785, y=337 | centro | Georgia, 60 px, normal, tracking 0.25 px | #ecdfc7 |
| ANFITEATRO DE LA JUVENTUD | x=540, y=1322 | centro | Georgia, 26 px, normal, tracking 0.2 px | #f4e7cb |
| 19 hs | x=540, y=1384 | centro | Georgia, 50 px, normal | gradiente gold |
| EVENTO GRATUITO | x=540, y=1422 | centro | Arial, 26 px, peso 600, tracking 1.3 px | #e2d3b7 |
| COLABORACIÓN: UN ALIMENTO NO PERECEDERO | x=540, y=1450 | centro | Arial, 18 px, peso 600, tracking 0.8 px | #e2d3b7 |
| SI LLUEVE VAMOS A | x=540, y=1482 | centro | Arial, 26 px, peso 600, tracking 2.6 px | #d2b473 |
| MARÍA AUXILIADORA | x=540, y=1514 | centro | Georgia, 26 px, normal | #f0e2c5 |
| NOS ACOMPAÑAN | x=540, y=1566 | centro | Arial, 20 px, peso 600, tracking 2 px | #d2b473 |
| www.vamosalsantisimo.com | x=61, y=1880 | inicio, izquierda | Arial, 32 px, peso 600, tracking 0.8 px | #d8c294 |
| Separador vertical | x=536, y=1880 | centro | Arial, 36 px, normal | #b79d6c |
| @vamosalsantisimof | x=683, y=1880 | inicio, izquierda | Arial, 32 px, peso 600, tracking 1 px | #d8c294 |

Los iconos sociales forman un conjunto con origen (559, 1850) y escala 2. Instagram usa un rectángulo de 20 × 20 unidades, radio 5, trazo 1.8, lente en (10, 10) de radio 4.4 y punto en (15.3, 4.8) de radio 1. Facebook conserva el trazado path con relleno #d8bd83 y transform translate(-6 0) dentro del grupo. TikTok conserva el trazado path con relleno #d8bd83 y transform translate(38 0) scale(.8333333) dentro del grupo. Los iconos PNG independientes se exportaron a 96 × 96 px.

El título superior usa dos estilos. El primer renglón es marfil liso. El segundo usa el gradiente horizontal gold. El SVG maestro guarda todos los valores literales de texto, coordenadas y estilos de fuente.

## Fotografías y logos en el canvas

| Elemento | x | y | ancho | alto | Nota |
|---|---:|---:|---:|---:|---|
| Custodia, host.png | 19.633 | 360 | 540.734 | 950 | Capa izquierda, mantener proporción |
| Pablo, pablo.png | 445 | 360 | 634.365 | 950 | Capa derecha, mantener proporción |
| Emblema, logo.png | 55 | 22 | 145 | 107.162 | Esquina superior izquierda |
| Mila Club, mila.png | 350 | 1575 | 380 | 96 | Centro; principal |
| Alma Verde, alma.png | 188.205 | 1694.491 | 113.589 | 75 | Tarjeta secundaria |
| Cabildo, cabildo.png | 483.205 | 1694.491 | 113.589 | 75 | Tarjeta secundaria |
| Las Kalas, kalas.png | 788.205 | 1694.491 | 113.589 | 75 | Tarjeta patrón de referencia |
| Fecha | 1030 | 38 | — | — | Encima del QR y alineada a la derecha |
| QR | 930 | 58 | 100 | 100 | Caja marfil, borde dorado de 1 px, radio 3 px |
| Texto bajo QR | 980 | 178 | — | — | Centrado debajo del código |

Las imágenes se dibujan con preserveAspectRatio xMidYMid meet. No reflejar las fotos. Se mantiene la custodia a la izquierda y Pablo a la derecha. Las dos imágenes originales son recortes con transparencia. El SVG añade máscara de desvanecimiento en la parte inferior de las figuras: opacidad completa hasta el 80 % de su caja, pasa a negro entre el 80 % y el 97 %, y queda negra al final. A la custodia se le aplica un filtro feDropShadow de color #d1a64e, desviación 10 y opacidad 0.18. El rostro y los tonos fotográficos de Pablo se conservan.

## Fondo y efectos

- Fondo: gradiente vertical de #040404 en 0 %, #080705 en 60 % y #040404 en 100 %.
- Halo principal detrás de la custodia: centro (290, 734.3), radios 440 × 465.5 px. Paradas radiales: #d8a64e, opacidad 0.32 en el centro; #ae762f, opacidad 0.17 al 35 %; #7e5325, opacidad 0.045 al 72 %; transparente al 100 %.
- Luz interior de la custodia: mismo centro; radios 351.477 × 256.5 px. #e1b75d a opacidad 0.14 en centro y #c58f36 a 0.06 al 50 %, transparente en el borde.
- Luz ambiente: elipse centrada en (560, 762.8), radios 650 × 503.5 px. #ab7a34 a opacidad 0.045 en el centro, #775229 a 0.025 al 60 %, transparente al borde.
- La luz concentrada es más intensa sobre la custodia. El halo ambiente y las partículas suaves continúan detrás de Pablo.
- Dos líneas doradas finas siguen estas curvas: M−120 1075.3 C180 1015.3 720 845.3 1200 735.3 y la misma curva desplazada 25 px hacia abajo. Grosor 1.25 px, opacidad de grupo 0.62; segunda línea con opacidad relativa 0.5. Gradiente: #a3712d a 0.12, #dbb66c a 0.67 en el 28 %, #b68a45 a 0.30 en 56 % y #b68a45 a 0.20 al final.
- Partículas: puntos entre 0.7 y 2.3 px de radio y opacidad entre 0.10 y 0.38. Sus ubicaciones exactas están escritas en el SVG maestro, en la agrupación de círculos.
- Separador curvo superior exacto: M62 1266 C285 1282 795 1282 1018 1266. El inferior: M62 1530 C285 1547 795 1547 1018 1530. Ambos tienen grosor 1.3 px y gradiente de #8e6428 a 0.15, #d0a65b a 0.65 en el centro y #8e6428 a 0.15 en el extremo.
- Línea bajo el título: M60 323 C165 327 280 321 370 324, grosor 2.5 px; gradiente borgoña #870b32 hacia #c9a568 transparente.
- Gradiente de letras gold, horizontal: #af7d38 en el inicio, #fae8c4 al 40 %, #d4ab6a al 74 % y #efd29b al final.

El SVG completo conserva los filtros, gradientes, máscaras, curvas y coordenadas exactas. Usa Flyer-final-editable.svg como referencia ante cualquier diferencia de redondeo en esta guía.

## Regla para incorporar auspiciantes automáticamente

Mila Club ocupa su propio espacio principal, centrado en x=540, encima de los auspiciantes secundarios. No se incluye en la cuadrícula secundaria.

Cada auspiciador secundario se coloca dentro de un marco de referencia de 113.589 × 75 px, que corresponde al tamaño de Las Kalas. El logo se centra dentro del marco, conserva su relación de aspecto y no se estira ni recorta. Conserva los colores de fondo que ya trae cada logo. Si el archivo nuevo es transparente, usa el color de tarjeta que corresponda a su marca.

Al recibir una lista de sponsors:

1. Conserva el orden de llegada o el orden editorial guardado en el inventario.
2. Añade los logos de izquierda a derecha en la primera fila.
3. Cuando la fila llegue a su capacidad, empieza la fila siguiente abajo y continúa de izquierda a derecha.
4. Para la plantilla automática, usa margen horizontal interior de 64 px, separación horizontal de 16 px, bloque de 113.589 × 75 px y paso vertical de 84 px. Calcula capacidad con floor((1080 − 2×64 + 16)/(113.589 + 16)); entran hasta 7 por fila.
5. Para una fila con n logos, anchoFila = n×113.589 + (n−1)×16 y xInicial = (1080−anchoFila)/2. El centro de cada sponsor se deriva de xInicial + i×(113.589+16). Así cada fila queda centrada aunque la última tenga menos logos.
6. Mila Club se mantiene centrado arriba de la cuadrícula, a x=350, y=1575, ancho 380 y alto 96 px. No se intercala con los demás.
7. Con este formato y el pie de redes en y≈1850–1880, hay espacio para dos filas secundarias bien legibles si se ajusta la separación vertical del bloque. Con más de 14 auspiciantes secundarios, genera una segunda historia de continuación con la misma identidad gráfica, conservando logos, escala y claridad.

Las tres tarjetas que ya se ven en la imagen conservan sus coordenadas actuales. La regla de centrado uniforme de filas describe cómo acomodar las marcas al regenerar la cuadrícula para un nuevo listado; el SVG mantiene el arte aprobado actual.

Los colores de relleno actuales de las tarjetas secundarias son #ffffff para Alma Verde, #000000 para Cabildo y #8a0000 para Las Kalas. Las Kalas mide 365 × 241 px y establece la proporción usada para el marco común.

## Referencia verificable de los archivos de imagen

| Archivo | Tamaño original |
|---|---:|
| logo.png | 525 × 388 px |
| host.png | 946 × 1662 px |
| pablo.png | 1025 × 1535 px |
| mila.png | 868 × 220 px |
| alma.png | 181 × 188 px |
| cabildo.png | 182 × 147 px |
| kalas.png | 365 × 241 px |

En assets-manifest.json se indica también si cada archivo contiene canal alfa. Los tres iconos sociales se exportan a PNG transparente en 96 × 96 px.

## Reproducción

El PNG final se renderiza desde el SVG editable con las imágenes de assets. El generador de recursos exporta los iconos sociales y recorta el QR como recursos independientes. El contenido del flyer y las medidas no dependen de IA de imagen: textos, líneas, filtros, logotipos y posiciones están definidos de forma editable en el SVG.


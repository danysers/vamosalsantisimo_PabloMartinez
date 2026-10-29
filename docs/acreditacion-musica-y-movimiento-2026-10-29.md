# Foto de la acreditación y movimiento del celular

La acreditación e inscripción imprimible ahora dicen **Taller de música**, tanto en la etiqueta como en el título de la tarjeta. Los correos del taller usan el mismo nombre. Se mantiene el QR emitido por el servidor y la distinción entre pago confirmado y efectivo pendiente.

La imagen entregada por la organización, `recursos/Taller/posta.png`, se copió sin modificar sus bytes a `public/formacion/assets/pablo-martinez-camisa-azul.png`. SHA-256 del original y de la copia: `78f358fd4088aeb1a45281b9c7f0b82d53f2bc57f28b5c10e464053016b4c500`. No se retocaron cara, figura ni colores, ni se generó una imagen alternativa. La tarjeta y las páginas del taller usan esa copia; los degradados y encuadres corresponden al diseño CSS existente. Los enlaces de recursos llevan versión nueva para actualizar la caché.

`public/device-tilt.js` incorpora orientación del dispositivo a la acreditación, al afiche pequeño de la portada y a la vista ampliada de la invitación. Conserva el movimiento con el puntero. En dispositivos con datos ya disponibles comienza automáticamente; cuando el navegador exige permiso, aparece **Activar movimiento con el celular**. El permiso se solicita únicamente desde ese botón y se puede desactivar el efecto. Un rechazo o la ausencia de sensores deja la tarjeta disponible.

El primer dato calibra la posición de reposo. La inclinación es acotada, se adapta al giro de pantalla y se actualiza como máximo una vez por cuadro. Solo se escucha orientación cuando alguna tarjeta está visible y activa. Se suspende con la pestaña oculta, al imprimir, al salir de la página y con «reducir movimiento». Al tocar el QR se detiene el efecto para facilitar su presentación. No se guardan ni se envían lecturas de sensores; los permisos de acelerómetro y giroscopio se limitan al mismo origen.

Las pruebas cubren calibración y límites, permiso solicitado desde un gesto, rechazo, dispositivos sin soporte, movimiento reducido, suspensión en segundo plano, impresión, QR quieto y orientación horizontal. La revisión visual local utiliza una inscripción y un QR ficticios marcados sin validez, sin crear pagos ni inscripciones en producción. No sustituye una prueba física en un teléfono concreto.

## Afiche final de la portada

El organizador entregó después `Flyer-final-historia.png` para reemplazar el afiche desactualizado de la página principal. Se copió sin retoques a `public/pagina principal con efecto/assets/invitacion-vamos-al-santisimo-2026-final.png` (1080 × 1920; 1.386.932 bytes; SHA-256 `0dec6cc7a155bd1ad228264531ea8dab6a273fbabbcd31c38e0ba459aaba1c30`). La miniatura 3D, la vista ampliada, todos los enlaces de descarga y el archivo compartido con las aplicaciones usan ese mismo original. La URL y el nombre de descarga nuevos evitan reutilizar la imagen anterior de la caché. Se conserva el efecto de movimiento incorporado en este trabajo.

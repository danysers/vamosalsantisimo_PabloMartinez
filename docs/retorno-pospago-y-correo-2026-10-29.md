# Retorno después del pago y entrega de correos — 29/10/2026

## Confirmación y acreditación

La tarjeta con QR, movimiento 3D y Filipenses 4,13 sigue presente en `public/formacion/checkout.js` y `styles.css`. No se perdió en un commit. El retorno dependía exclusivamente del acceso privado guardado en `sessionStorage`: al abrirse otra pestaña o navegador, o cambiar de dominio, faltaba ese acceso y se mostraba una consulta sin progreso.

Los checkout nuevos incluyen una capacidad firmada con HMAC y vencimiento de 24 horas, vinculada a la referencia, inscripción y solicitud original. Viaja en el fragmento de la URL de retorno, que el navegador elimina antes de intercambiarlo por el acceso al comprobante. No se envía como parámetro HTTP ni como Referer. El intercambio exige origen permitido, JSON pequeño y válido, limitación de solicitudes y una inscripción vigente; devuelve `private, no-store`. Las inscripciones archivadas o eliminadas quedan excluidas.

La confirmación y el QR siguen dependiendo del estado del pago verificado por el servidor. El retorno no confirma pagos ni emite credenciales. Las órdenes existentes conservan su URL y su importe. Para enlaces antiguos o vencidos sin acceso guardado, se ofrece la recuperación existente mediante código al correo registrado, junto con ayuda por WhatsApp y un aviso de no repetir el pago.

Se conserva el diseño y la animación de la acreditación. Las tres páginas de inscripción, pago y comprobante cambian la versión de los scripts para evitar caché anterior. No se modifican importes, cuenta de Mercado Pago, claves ni configuración DNS.

Validación local: veinte pruebas de seguridad del acceso, orígenes y controlador de confirmación aprobadas; TypeScript y ESLint sin errores. Las pruebas de PostgreSQL descartable verifican el intercambio, su rechazo con firma alterada, archivo y eliminación; comprueban que un retorno no aprueba una inscripción pendiente ni muestra un QR sin pago y que el checkout simulado recibe una URL recuperable. La publicación continúa sujeta a la suite completa, arranque de imagen y análisis de seguridad de CI. No se realiza ningún pago para validar estos cambios.

## Correos

Se verificaron el trabajador y la cola de producción: los mensajes originales estaban marcados como enviados, sin trabajos pendientes ni fallidos. Ese estado significa aceptación SMTP, no recepción en la bandeja del destinatario. No se encontró un rebote correspondiente a la cuenta Outlook informada.

Con autorización expresa del titular se envió una prueba técnica sin datos de asistentes a su Gmail y se reencoló una sola acreditación ya abonada para su dirección Outlook registrada, reutilizando el QR existente. Gmail recibió la prueba en Entrada y verificó SPF, DKIM y DMARC correctos. El servidor SMTP aceptó el reenvío de la acreditación el 29/10/2026 a las 17:01 UTC (14:01 de Argentina).

La recepción final en Outlook queda pendiente de confirmación del usuario, quien indicó que lo revisará después. No corresponde afirmar que esa entrega esté resuelta ni cambiar SPF/DKIM/DMARC sin evidencia adicional. Si no llega, corresponde solicitar al proveedor SMTP el seguimiento de esa entrega aceptada. No se hicieron reenvíos masivos, cobros ni nuevas inscripciones.

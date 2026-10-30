# Respuesta interrumpida al subir un comprobante

El mensaje del navegador «Failed to fetch» no es una confirmación de rechazo de pago ni prueba por sí solo si el archivo llegó a la base. Puede faltar la respuesta de la subida. Para diagnosticar una gestión se consulta su ficha privada y sus comprobantes; la ausencia de archivos confirma únicamente que no hay un comprobante guardado en ese momento. Sin un registro de red del dispositivo no corresponde atribuir una causa exacta al celular, proveedor o servidor.

El controlador del taller conserva el archivo elegido ante un fallo y muestra una indicación en español. Después de un resultado incierto consulta una sola vez el estado con el acceso privado de la misma inscripción, con un límite de ocho segundos para esa consulta. Si ya hay un comprobante guardado, muestra el estado real. Esto no afirma que un archivo seleccionado diferente haya llegado ni confirma el pago. Si no se puede verificar o no hay archivo, permite un reintento explícito sin reinscribirse ni pagar otra vez.

No se repite automáticamente el POST del archivo. Se bloquean envíos concurrentes para la misma gestión, se pausa la consulta periódica durante la subida y se reanuda después. El archivo se limpia únicamente tras una respuesta satisfactoria reconocida. Las respuestas HTTP y HTML inesperado se convierten en mensajes legibles; no se vuelcan excepciones técnicas del navegador al participante.

Se conservan las validaciones del servidor: acceso privado, inscripción actual, transferencia pendiente, formatos permitidos, máximo 5 MiB, límites compartidos, comparación de hash para duplicados y límite de archivos por pago. No cambian el destino en Drive, el pago, el QR ni el circuito de aprobación. Las páginas del taller usan una nueva versión de `checkout.js` para obtener el controlador actualizado al recargarlas.

Las pruebas del controlador usan DOM y red simulados: fallo antes de guardar, respuesta perdida después de guardar, fallo también en la consulta de estado, HTTP 413, HTML inesperado, éxito y doble envío. No envían archivos ni generan mensajes o pagos reales.

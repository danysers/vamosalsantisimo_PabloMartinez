# Accesos personales por correo y registro de incidencias

El correo de inscripción pendiente incluye «Subir mi comprobante». El enlace abre `/formacion/comprobante` con la inscripción recuperada, sin DNI, código ni formulario personal. Esa vista permite únicamente adjuntar el archivo al pago por transferencia pendiente del pagador. Mercado Pago se verifica automáticamente; efectivo y ayudas no pendientes de transferencia no admiten subir un archivo. El correo grupal da el enlace al pagador del grupo.

El correo de acreditación conserva su QR adjunto y agrega «Ver mi volante 3D e imprimir». `/formacion/acreditacion` muestra el mismo QR vigente, la foto original actual, el movimiento con mouse o giroscopio y la impresión existente. Admite transferencias por alias/QR, Mercado Pago, pagos manuales y ayudas/exenciones aprobadas, incluso sin intento de pago. No aprueba ni modifica pagos y no emite credenciales nuevas al consultar. Ventanilla no recibe acceso al volante 3D ni muestra una tarjeta previa al pago; el QR de acreditación que se envía al confirmar efectivo conserva su funcionamiento administrativo.

Los enlaces nuevos se incorporan a los próximos envíos y a los reenvíos de acreditación que solicite un operador. No se reenvían correos anteriores automáticamente. Los mensajes ya entregados no se pueden modificar.

## Alcance de los enlaces

Son capacidades HMAC distintas para subir y ver el volante, incompatibles entre sí y con el acceso al checkout. Su firma vincula registro, referencia, clave de creación, correo y, en la acreditación, la credencial activa y el estado del correo alternativo. Cambiar el destinatario, revocar el QR, archivar/eliminar o reemplazar el registro invalida el acceso correspondiente. El servidor siempre vuelve a comprobar el estado actual y el evento configurado. Un enlace de comprobantes no entrega datos personales, un QR ni la posibilidad de cambiar el pago.

El secreto viaja en el fragmento `#proof=...` o `#pass=...`, se retira de la barra antes de consultar y se conserva sólo en la sesión de esa pestaña. No viaja en consultas HTTP, Referer ni registros de errores. La página y su API no admiten caché y usan `no-referrer`. GET no consume el acceso, para que la vista previa de correo no inutilice el enlace. Vencen como máximo a los 120 días y no después de tres días del encuentro; el acceso al volante además respeta la vigencia del QR.

## Registro en el panel

«Errores e incidencias» queda disponible a configuración y operadores de inscripciones, fuera de la web pública y de operadores de ingreso. Permite buscar por gestión verificada o código de seguimiento. Distingue reportes del navegador de errores HTTP observados por el servidor. La fecha corresponde a la recepción del registro.

Se instrumentan las operaciones de inscripción, recuperación, consulta/retorno de pago, checkout, cambio de medio, subida y acceso desde el correo, además de errores de ejecución o recursos de las páginas. Una subida fallida informa si la consulta posterior encontró algún comprobante, no encontró ninguno o no pudo consultar. Eso no prueba que un archivo seleccionado distinto haya llegado ni que el pago esté aprobado. El identificador compartido permite relacionar lo que vio el navegador con el error HTTP del servidor.

Los campos son una lista cerrada: operación/código, identificador, origen, fecha de recepción, estado HTTP y, cuando corresponde, tamaño/tipo de archivo, conexión declarada y resultado de la consulta. No se almacenan mensajes de excepción, stacks, URL, consultas, fragmentos, IP, agente de navegador, correo, documento, nombre de archivo, contenido de formularios, archivos o credenciales. La asociación a una gestión requiere verificar su acceso privado; una referencia sola no alcanza. Los detalles están limitados a 1 KiB.

La migración 0036 añade sólo la tabla de incidencias e índices. El almacenamiento se serializa con un bloqueo no bloqueante, deduplica identificadores, limita eventos a 120/minuto por evento configurado, elimina entradas con más de 30 días y mantiene hasta 5.000 filas globales. La ingesta pública además está limitada a 60/minuto con cuerpo de 4 KiB. La cola del navegador conserva hasta ocho reportes sin secretos, deduplica durante un minuto y reintenta como máximo tres veces por carga. El archivo de comprobante nunca se vuelve a enviar automáticamente.

El registro es de mejor esfuerzo: sin red, con el proceso apagado, con JavaScript bloqueado o con PostgreSQL caído no se puede garantizar que aparezca un evento. Si falla su almacenamiento, el servidor emite sólo un código y el identificador a su salida técnica. Los fallos de entrega de correos siguen consultándose en la ficha y la cola existente. Este registro no reconstruye incidentes anteriores ni reemplaza el monitoreo del servidor.

Las pruebas usan datos y SMTP ficticios y PostgreSQL desechable. Cubren separación de permisos de enlaces, vencimiento, cambio de correo/revocación, subida, ayudas sin pago, efectivo, QR idéntico, cola sin conexión, campos privados rechazados, límites/retención y accesos HTTP del panel.

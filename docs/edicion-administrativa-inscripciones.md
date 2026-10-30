# Ficha y edición administrativa de inscripciones

La lista del panel muestra teléfono, procedencia, comprobantes adjuntos, estado
del QR e ingreso, además de los datos previos. El filtro de búsqueda incluye el
teléfono. La columna **Medio de pago elegido** distingue transferencia (alias / QR),
Mercado Pago, efectivo en el taller, registro manual o solicitud de ayuda. El
estado del pago figura por separado. **Editar**, junto al nombre y sin desplazar
la grilla, abre `/admin/inscripciones/[referencia]?editar=1` con el formulario
habilitado para una inscripción vigente. **Ver ficha** conserva el modo de consulta.
El resumen del panel y los comprobantes también muestran el medio y un acceso a
editar. Al consultar una referencia en Pagos y acreditación se muestra su medio
actual, leído de la ficha privada; cada comprobante identifica su propio intento.

La ficha reúne los datos personales, contacto, procedencia, comunidad, intentos
de pago, comprobantes, acreditación, estado de correos y últimas correcciones.
Los importes de una persona y el total de una operación grupal se identifican
por separado. “Aceptado por el servidor de correo” no afirma entrega en bandeja.

## Edición

Los roles operativos `configuration` y `registration_operator`, vinculados a
una cuenta administrativa activa, pueden corregir nombre, apellido, D.N.I.,
nombre del volante, nacimiento, correo, teléfono, país, provincia, localidad,
grupo/comunidad, movimiento, estado eclesial y ocupación. Es necesario indicar
el motivo. El rol de admisión no obtiene acceso a esta ficha ni a su API.
En la ficha, **Medio de pago elegido** está en el resumen superior y **Editar
inscripción** aparece en la barra de acciones. El medio mostrado es el del
último intento registrado; el historial conserva los anteriores. Se muestra
para consulta y no se modifica desde la edición de datos personales.

Cada guardado valida los campos, verifica duplicados y registra operador,
fecha, motivo y nombres de los campos modificados en `audit_log`. No duplica
los valores personales anteriores en la auditoría. El registro y su formulario
se guardan juntos en una transacción, con el mismo orden de bloqueos del taller
usado por la inscripción y el archivado. Una versión basada en ambas fechas de
actualización impide sobrescribir cambios hechos desde otra pestaña.

Los registros archivados, eliminados, históricos o sin formulario completo se
consultan sin edición; se recuperan mediante el circuito existente antes de
corregirlos.

## Correo y conservación del historial

Cambiar el correo exige una confirmación explícita. Si hay un correo destinado
al participante ya en envío, la corrección se rechaza temporalmente. Los correos
pendientes al destinatario anterior se bloquean durante la transacción y se
cancelan; los códigos de recuperación anteriores se consumen y se borra su
contenido cifrado. Los avisos operativos destinados a administradores se
conservan incluso si coinciden con la dirección de un participante.

Guardar datos no envía correos nuevos ni reenvía automáticamente un QR. No se
modifican precios, estados de pago o inscripción, transacciones del proveedor,
referencias, claves de retorno/acceso ni credenciales QR. Los cambios de pagos y
acreditación continúan en “Pagos y acreditación”. Las claves de acceso se
conservan para no romper retornos de pagos que estén en curso.

## Seguridad y validación

La API privada `/api/admin/inscripciones/ficha` admite GET y PATCH, exige sesión
y vínculo operativo, restringe la inscripción al evento del panel y verifica
Origin al guardar. Devuelve `private, no-store`; rechaza JSON de más de 12 KiB y
campos desconocidos, incluidos importes, estados y operador proporcionados por
el cliente. No devuelve claves de acceso, tokens ni contenido binario de QR o
comprobantes. Los fallos solo registran una correlación, sin datos personales.

Las pruebas usan PostgreSQL descartable y asistentes ficticios para verificar
ediciones, conflictos, duplicados, correcciones simultáneas, conservación de
pagos/QR/accesos, recuperación, cancelación selectiva de correos y controles HTTP
de sesión, rol, Origin y superficie pública. No se corrigen asistentes reales
ni se realizan pagos o envíos reales para validar esta función. No requiere
migraciones nuevas ni cambios de configuración del servidor.

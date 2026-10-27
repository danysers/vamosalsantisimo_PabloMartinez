# Taller 2026: estado y pendientes antes de abrir inscripciones

**Corte de revisión:** 27 de octubre de 2026. Este documento describe el código y la base **locales**; no confirma un despliegue en producción. No habilitar inscripciones ni cobros reales solo porque una función figure como implementada.

**Entorno de prueba en curso:** Dokploy tiene `prueba-rama-oficina` con PostgreSQL aislado y saludable. El primer build web se canceló después de una sobrecarga de la VM compartida; se preparó un Dockerfile/Compose de menor concurrencia, pero la web, el dominio HTTPS y el autodespliegue aún deben verificarse. Los servicios del entorno `production` no se editaron.

## Pendientes prioritarios

- [ ] Probar el lector QR con la cámara de un dispositivo real y el panel bajo HTTPS. El lector está implementado y probado localmente, pero permanece cerrado por defecto (`ADMISSION_SCAN_ENABLED=0`).
- [ ] Completar Mercado Pago con credenciales de la organización, creación persistente de órdenes, webhook autenticado, conciliación de cobros/reversos y pruebas con cuentas de prueba. **Hoy no se cobra por Mercado Pago.**
- [x] Añadir al panel la edición de lotes y promociones, y el flujo operativo de inscripciones/pagos grupales. **Implementado localmente**; aún falta probarlo con correos/dispositivos en el despliegue antes de abrir inscripciones.
- [ ] Desplegar los stacks separados de PostgreSQL y aplicación/panel/trabajador en Dokploy. Probar allí el trabajador SMTP, las migraciones, el aislamiento de dominios, las copias de seguridad y una restauración.
- [ ] Ejecutar en el entorno desplegado una prueba integral: formulario → pago o excepción → correo → volante con QR → lectura → rechazo de un segundo ingreso y de un pago revertido.
- [ ] Configurar opciones reales de acreditación de fondos de Mercado Pago, generar y probar los recordatorios por correo para revisar sus tasas/plazos. Los cambios en la cuenta de Mercado Pago seguirán siendo manuales.
- [ ] Solo tras esas verificaciones, habilitar de forma deliberada el trabajador de correo, `REGISTRATION_EMAIL_READY=1` y `workshops.registration_open=true`.

## Comparación con la lista anterior

| Tema mencionado antes | Estado actual | Qué falta exactamente |
| --- | --- | --- |
| Correo de confirmación | **Implementado y probado parcialmente.** Existen plantillas para transferencia, pago en el lugar, ayuda solicitada/aprobada, pago confirmado y QR. Se enviaron correos ficticios de prueba desde el buzón oficial y el organizador confirmó recepción. | Probar el **trabajador real** conectado a PostgreSQL y SMTP en Dokploy, incluidos reintentos y entrega de un QR de ensayo. No enviar comunicaciones reales a participantes antes de abrir el circuito. |
| Formulario, PostgreSQL e idempotencia | **Implementado localmente.** La API valida datos, toma el precio desde la base y guarda inscripción, pago/ayuda y tareas de correo en una transacción. Un reintento idempotente no debe duplicarlos. | Mantener la inscripción pública cerrada hasta la prueba integral. La frase anterior «una única tarea de correo» ya no es universal: una solicitud de ayuda también encola un aviso al organizador. |
| Transferencia y pago en el lugar | **Implementados.** Se muestran instrucciones, alias y enlace para preparar el WhatsApp. Ambos pagos nacen pendientes. El panel permite verificarlos manualmente y emitir el QR tras la confirmación. | El operador debe comprobar realmente el comprobante o cobro; abrir WhatsApp no adjunta ni verifica nada automáticamente. |
| Servicio SMTP y DNS | **Datos técnicos verificados.** El buzón de DonWeb, los parámetros SMTP no secretos y los registros MX/SPF/DKIM/DMARC ya se revisaron. La contraseña queda solo en el `.env` local ignorado por Git. | Cargar el secreto en Dokploy y probar el trabajador allí. Por eso la tarea antigua de «averiguar SMTP/DNS» está **resuelta**, pero la operación en producción no. |
| Docker y Dokploy | **Preparado, no desplegado.** Hay un stack de PostgreSQL y otro de aplicación con web pública, panel privado opcional y trabajador de correo. PostgreSQL y la imagen se probaron localmente. | Configurar redes, volúmenes, secretos, dominios HTTPS y respaldos en Dokploy; verificar restauración y despliegue antes de habilitar autodeploy. |
| Panel administrativo | **Funcional localmente para lotes, promociones, grupos, ayuda, verificación manual, volante y escaneo.** Los grupos pueden incorporar personas nuevas o referencias individuales pendientes y se cobran con un intento único. | Faltan integración y seguimiento real de Mercado Pago, además de validación operativa en producción. |
| Mercado Pago | **Contrato y conciliación preparados en código de forma parcial; cobro deshabilitado.** | Conectar órdenes reales a intentos persistidos, validar webhooks firmados y reconsultar al proveedor antes de aprobar pagos; probar duplicados, retrasos, rechazos y reversos. |
| Volante y QR de ingreso | **Implementados y probados localmente.** El QR personal se emite solo tras pago verificado, ayuda aprobada o exención válida; puede abrirse un volante imprimible. El primer escaneo registra ingreso y el segundo se rechaza. | Probar cámara física y envío/impresión del volante en el entorno final. El QR promocional de los flyers no es el QR personal de acreditación. |
| Recordatorios de acreditación de fondos | **Planificador, esquema y tarea de correo preparados.** | Verificar opciones vigentes de Mercado Pago, configurar fechas/tasas reales, activar la programación y probar recepción; el sistema avisa, pero no cambia automáticamente la configuración de Mercado Pago. |

## Trazabilidad y seguridad ya incorporadas

- PostgreSQL guarda marcas de fecha y hora para inscripción, pagos y verificaciones, revisión de ayuda, emisión o revocación del QR, tareas de correo, impresiones/aperturas de volante, intentos de lectura e ingreso. Los cambios de estado de inscripciones y pagos se reflejan en `audit_log`.
- El QR de acreditación es individual: se conserva un hash para encontrarlo y una copia cifrada para reimpresión/envío, **no el valor en claro**. La elegibilidad vuelve a comprobarse al ingreso; un pago revertido no debe habilitar el acceso.
- La base local tiene las 20 migraciones aplicadas y los datos de configuración del taller, pero, tras retirar los registros ficticios de prueba, **no tiene inscripciones, pagos, QR ni ingresos reales**. Los conteos son una fotografía de esta fecha.
- La rama de trabajo para esta funcionalidad es `rama_oficina`; los cambios de lotes, promociones y grupos se publican allí, sin modificar `main`.

## Operación de lotes, promociones y grupos

- En `/admin/taller`, un operador con permiso de configuración puede cambiar el lote activo, editar precios y crear o modificar promociones por cantidad, descuento fijo o período de vigencia. Las condiciones económicas de una promoción ya utilizada no se reescriben; se puede desactivar para nuevas operaciones.
- El panel permite buscar inscripciones individuales pendientes y formar un grupo con esas referencias o con participantes nuevos (entre 2 y 20 personas). Se indica quién paga y si lo hará por transferencia o en el lugar.
- Primero se muestra una cotización calculada con las tarifas de PostgreSQL. Si cambian integrantes, lote, precio o promoción antes de registrar el grupo, se exige una nueva cotización. El registro es idempotente y conserva la asignación del importe a cada persona.
- Al agrupar inscripciones individuales pendientes se cancelan sus intentos e instrucciones de pago anteriores. No se agrupan pagos confirmados, ayudas/exenciones ni credenciales QR ya emitidas. Si el precio individual congelado difiere del precio actual del lote, también se bloquea el agrupamiento para no modificarlo silenciosamente.
- La confirmación manual del pago grupal puede hacerse usando la referencia de cualquiera de sus integrantes: confirma el intento común y habilita un QR individual para cada persona. El importe y las instrucciones del grupo se envían solo al pagador; los demás reciben aviso para no pagar por separado.
- **Estado operativo:** se pueden probar cotizaciones, pero la creación de inscripciones grupales reales sigue cerrada hasta activar deliberadamente `workshops.registration_open` y `REGISTRATION_EMAIL_READY=1`. La integración con Mercado Pago y las pruebas desplegadas siguen pendientes. No usar el panel local como comprobación de funcionamiento en producción.
- **Verificaciones locales:** tipos, lint, compilación, pruebas automatizadas, imagen Docker y un flujo grupal integral sobre una base descartable. `pnpm test` genera ahora su propio build actualizado en `.next-test`, sin usar una compilación vieja ni reemplazar la vista local abierta. No se enviaron correos reales ni quedaron registros ficticios de la prueba.

## Criterio para abrir al público

No basta con que el formulario o el QR funcionen en localhost. Abrir únicamente después de verificar pagos reales o sus alternativas, correos, permisos del panel, lectura física de QR, reversos, respaldos/restauración y operación del despliegue; luego activar los interruptores de inscripción y correo de manera controlada.

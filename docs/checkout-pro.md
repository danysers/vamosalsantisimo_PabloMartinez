# Checkout Pro Argentina: integración del taller

## Estado local del 27/10/2026

Se importó exclusivamente el taller y su backend de `origin/rama_oficina` (`3182a3e`), conservando la portada animada local. PostgreSQL 16 está iniciado en Docker, accesible únicamente por `127.0.0.1:54321`, con `vas_dev` para desarrollo y `vas_test` descartable para pruebas. Se aplicaron las migraciones hasta `0022_registration_nickname`.

La aplicación **Vamos al Santisimo - Taller** ya existe, separada de FacturarCodss QR. ID del panel: `1258485942121950`. En las credenciales de prueba, la API devuelve la aplicación `7734596802948848`; ese identificador, no el del panel, debe coincidir con `integration_data.application_id`. El vendedor se comprobó con `/users/me`. El Access Token está exclusivamente en `.env` ignorado por Git; nunca incluir respuestas completas de Orders en logs, porque contienen `client_token`.

Los precios solicitados son **ARS 10.000 / 15.000 / 20.000** para los lotes 1/2/3. Se mantienen **ARS 1.000 de gastos de servicio** por pago online individual: Checkout Pro cobra ARS 11.000 / 16.000 / 21.000 respectivamente. El lote 1 está activo; los otros se activan manualmente desde `/admin/taller`, sin fechas automáticas inventadas. El panel muestra el total online correspondiente al precio guardado.

La prueba inicial se pagó con una cotización anterior de ARS 15.000 más gastos de servicio, total ARS 16.000. Ese intento y su QR conservan el importe original; no se recotizan pagos ya creados. La interfaz pública presenta «valor del taller + gastos de servicio» y muestra el importe final en el botón de checkout, sin repetir el desglose técnico del adicional.

Una sola aplicación procesa todos los lotes: cada inscripción tiene su order, monto y referencia. El organizador pidió optimizar la comisión con fondos disponibles tres días antes del encuentro. Se verificaron las tarifas reales de Checkout y se guardó en Mercado Pago el plazo de 35 días al 1,53% antes de IVA/retenciones; después de recargar permaneció seleccionado y Guardar quedó deshabilitado. Ver `docs/plan-disponibilidad-2026.md`. No se crearon aplicaciones adicionales. El gasto de servicio es una decisión del organizador, no un cálculo de la comisión efectiva de Mercado Pago.

### Circuito implementado

1. `/formacion/inscripcion` obtiene el lote activo y los medios habilitados desde `/api/taller/configuracion`. `/inscripcion` redirige a este formulario.
2. El alta valida la ficha, guarda una reserva y un intento con monto, adicional, referencia externa e idempotencia congelados. El navegador no decide el importe. Transferencia, pago presencial y solicitud de ayuda mantienen el circuito de oficina.
3. `POST /api/taller/pagos/checkout` exige referencia y un token privado derivado mediante HMAC. Crea la order de Checkout Pro (`POST /v1/orders`) con el importe congelado del lote más gastos de servicio, y reutiliza el mismo checkout en reintentos concurrentes. El formulario no recibe ni almacena datos de tarjetas; el importe toma el lote activo de PostgreSQL.
4. En HTTPS el checkout navega en la misma pestaña para conservar `sessionStorage` al retornar; en HTTP local se abre otra pestaña porque no hay retorno público. `POST /api/taller/pagos/estado` vuelve a consultar al proveedor de forma autenticada. El retorno `/formacion/pago?reference=…` nunca aprueba por parámetros del navegador. Los tokens permanecen en `sessionStorage`, fuera de URLs y WhatsApp.
5. La conciliación verifica order, referencia, importe, ARS/Argentina, vendedor, aplicación y entorno. Solo un pago íntegramente acreditado emite el QR único y encola su correo en una transacción. Los eventos repetidos no duplican el QR; una devolución o contracargo invalida la acreditación. Un pago posterior al vencimiento de la reserva vuelve a comprobar la capacidad antes de acreditar.
6. `/api/mercado-pago/webhook` valida la firma HMAC, conserva el evento y vuelve a consultar Orders. Si falla, devuelve 503 para permitir el reintento del proveedor. No se aceptan topics de la aplicación de QR/facturación.

### Configuración y alcance de la prueba

`MP_ENVIRONMENT=test`, `MP_CHECKOUT_ENABLED=1`, `MP_ACCESS_TOKEN`, `MP_APPLICATION_ID`, `MP_SELLER_USER_ID` y `WORKSHOP_CHECKOUT_TOKEN_KEY` están configurados localmente. `MP_PANEL_APPLICATION_ID` es solo una referencia del panel. Las IDs de prueba deben comenzar con `ORDTST`; el servidor bloquea mezclar órdenes de producción y prueba.

`WORKSHOP_LOCAL_TEST_MODE=1` solo funciona con Next en desarrollo, origen loopback y entorno Mercado Pago de prueba. Permite registrar datos ficticios sin SMTP: los mensajes quedan en cola sin iniciar un trabajador masivo. El envío puntual de prueba se ejecutó expresamente con el script indicado en `docs/configuracion.md`. No habilita esa excepción en producción. `REGISTRATION_EMAIL_READY` continúa en `0`.

Se completó una compra en el **entorno de prueba** por ARS 16.000. Se usó exclusivamente la Mastercard oficial ficticia terminada en `0604`, titular `APRO`, DNI ficticio `12345678`, vencimiento `11/30`, código `123`, como invitado. La API confirmó `processed/accredited`, importe pagado ARS 16.000 y entorno de prueba; PostgreSQL guardó el pago aprobado, confirmó la inscripción y emitió un único QR. La pantalla local mostró «Pago de prueba confirmado». No se usaron tarjetas guardadas ni hubo cargos reales. Posteriormente se envió un único correo de acreditación de prueba, con el QR ya existente, a la dirección solicitada por el organizador, y se comprobó su recepción en Gmail. El estado visible del correo se obtiene de `email_outbox`; la pantalla solo anuncia el envío cuando está marcado como enviado.

La sesión real abierta rechaza combinarse con la tarjeta ficticia («Una de las partes […] es de prueba»). Se resolvió usando el selector de cuenta del checkout y volviendo al enlace de pago para elegir «Sin cuenta de Mercado Pago». En nuevas pruebas también puede usarse una ventana privada. No confundir el error de mezcla de entornos con un rechazo de tarjeta real.

Se verificaron dos particularidades de `GET /v1/orders/{id}`: una order recién creada omite `transactions` y `total_paid_amount`; una aprobada incluye `transactions.payments` y omite las colecciones vacías `refunds`/`chargebacks`. El adaptador admite esas ausencias sin relajar las comprobaciones de aprobación ni aceptar colecciones malformadas.

**Para publicar cobros faltan:** elegir y desplegar un origen HTTPS del taller, configurar allí las variables y el receptor de webhook, guardar su secreto en `MP_WEBHOOK_SECRET`, probar la notificación real y la entrega SMTP, y finalmente cambiar a credenciales/IDs de producción con autorización. `MP_PUBLIC_ORIGIN` y `MP_WEBHOOK_SECRET` continúan vacíos en este entorno local: no se expuso localhost ni se cambió el despliegue. La conciliación local funciona al consultar el estado; sin un webhook accesible no se promete confirmación si el participante cierra todas las pestañas.

### Confirmación y acreditación en pantalla — 28/10/2026

La pantalla posterior al alta muestra únicamente el siguiente paso de pago y la referencia, sin repetir la ficha personal. Conserva la referencia en la URL y la autorización privada en `sessionStorage`, de modo que F5 o el retorno del checkout recuperen el estado sin volver a inscribirse ni pagar.

La consulta automática empieza después de preparar el checkout: cada cinco segundos al principio, luego cada quince mientras esté pendiente. Reintenta tras errores de red, se pausa con la pestaña oculta y consulta al volver. Los estados finales se revisan cada minuto y al recuperar foco. No se aprueba por la URL de retorno ni por un mensaje del navegador.

Al confirmar el servidor pago aprobado e inscripción confirmada, reemplaza el siguiente paso por la bienvenida, oración, Filipenses 4,13 y una tarjeta 3D en crema/dorado/bordó con Pablo Martínez, fecha, sede y QR. `POST /api/taller/pagos/estado` reutiliza la credencial cifrada emitida por la aprobación; verifica hash, clave, vigencia, ausencia de revocación y elegibilidad actual antes de devolver una imagen PNG. Nunca crea otro QR por consultar. Responde `private, no-store` y `noindex, nofollow`; no retorna la ficha personal ni la credencial como texto. Si cambia a revisión/devolución, el navegador retira el QR.

El botón Imprimir abre la impresión de la acreditación sola, con QR negro sobre blanco, sin controles ni animaciones. En pantalla se respeta movimiento reducido y la tarjeta queda quieta al señalar el QR. Las acreditaciones de sandbox llevan una banda «PRUEBA · SIN VALIDEZ PARA EL EVENTO», también impresa.

Verificación específica: TypeScript, ESLint y build correctos; nueve pruebas de inscripción/pago/seguridad con PostgreSQL descartable y tres pruebas del controlador de pantalla, incluyendo espera mayor a 100 segundos, recuperación, respuestas demoradas de una visita anterior, impresión y retiro del QR ante devolución. La revisión visual usó el pago de sandbox ya aprobado, sin efectuar otro pago ni usar tarjetas guardadas. Continúa siendo una implementación local; este cambio no publica el sitio ni habilita cobros reales.

### Elegir otro método de pago — 28/10/2026

Se eliminó el control manual «Actualizar estado»: continúa la consulta automática. «Elegir otro método de pago» abre un selector de Mercado Pago, transferencia o pago en el taller, según disponibilidad. Guardar cambia solamente el intento de pago; mantiene inscripción, referencia y ficha. Los métodos presenciales y transferencia también reciben autorización privada en la sesión para poder recuperar y editar su siguiente paso.

El endpoint `POST /api/taller/pagos/metodo` valida origen, token privado, intento esperado, disponibilidad y cupo. Solo permite cambios individuales sin dinero cobrado. No modifica pagos aprobados, en revisión o grupales. Si hay una order de Mercado Pago, comprueba su identidad, importe, vendedor y entorno; solicita su [cancelación oficial](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/cancel-order/post) con clave idempotente y vuelve a consultar para confirmar que quedó cancelada sin cobros. Si está procesándose o la verificación falla, conserva el método anterior y no crea otro intento.

La migración 0021 identifica al intento sustituido, impide dos sucesores y permite copiar únicamente su cotización exacta e inmutable. De esta manera, cambiar el precio de un lote no aumenta el importe de una inscripción existente: solo se agrega o retira el gasto de servicio online. Se conservan los intentos anteriores como historial; los avisos pendientes antiguos se reemplazan por instrucciones del nuevo método. La nueva migración debe aplicarse antes de desplegar este código en otro entorno.

Las pruebas cubren la edición sin nueva inscripción, reintentos/concurrencia, cambio de lote, cancelación verificada y recuperación de respuesta perdida; rechazan autorización incorrecta, pagos en procesamiento y cotizaciones alteradas. Se comprobaron también los circuitos grupal, de correo y de acreditación existentes.

### Inscripción con pago en el taller y apodo — 28/10/2026

«Apodo (opcional)» aparece debajo del nombre; admite hasta 80 caracteres y se guarda como dato opcional de la ficha (migración 0022). Se muestra en la bienvenida y en la tarjeta cuando está informado, sin sustituir el nombre legal.

Al elegir pago en el taller se abre inmediatamente la confirmación, con la misma tarjeta 3D, oración, QR e impresión. Mantiene inscripción y pago pendientes y lo dice expresamente tanto en pantalla como en la tarjeta impresa. Este QR usa el prefijo separado `VASR1`, firmado para consulta de esa inscripción; no crea una acreditación aprobada ni reutiliza el token privado para editar pagos. El lector autenticado localiza a la persona y avisa que debe registrarse el pago. Una vez aprobado, ese mismo QR impreso se vincula con su acreditación vigente y pasa por los controles habituales de pago, revocación, vencimiento e ingreso único.

Si se reenvía una ficha duplicada desde el navegador que conserva su autorización privada, se recupera la inscripción existente en vez de crear otra. El servidor valida esa autorización antes de devolver la referencia o actualizar el apodo; nombre, teléfono o correo por sí solos no permiten recuperar una credencial. Si el usuario eligió otro medio al reenviar, se usa el cambio de método ya protegido, con cancelación de la order anterior cuando corresponde. Un navegador sin autorización conserva una respuesta genérica que indica cómo recuperar su confirmación.

Se verificaron la ficha con apodo, la recuperación con la misma referencia, ausencia de aprobación o ingreso al mostrar el QR pendiente, rechazo de firmas ajenas y uso posterior al pago sin duplicar el ingreso.

### Verificación del cambio

- Build de producción, TypeScript y ESLint correctos.
- Batería completa: 69 pruebas aprobadas, 0 fallidas, 1 omitida (requiere credenciales de operador). Incluye PostgreSQL descartable, pagos, reintentos concurrentes, aprobación, QR, devolución y circuito grupal con transporte de correo simulado. Se verificó también que los tres lotes produzcan los importes online correctos en la misma integración y que cambiar precios no modifique cotizaciones anteriores. El plan de fondos prueba cambios de fase a medianoche argentina, la fecha objetivo, auditoría y recordatorios opcionales sin duplicados.
- Prueba real de sandbox por ARS 16.000 completada y verificada por la API autenticada y la base local.
- Interfaz revisada en escritorio y móviles de 390/320 px; opciones de pago apiladas sin desbordamiento. El HTML y los recursos de la portada animada no se modificaron.

Documentación oficial: [crear Orders](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order), [consultar una order](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get), [retornos](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/web-integration/configure-back-urls), [notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications), [tarjetas y compras de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/integration-test/test-purchase-with-card).

## Historial anterior: diagnóstico del 26/10/2026

Lo siguiente conserva el diagnóstico previo a importar `rama_oficina`; sus pendientes de implementación quedan sustituidos por el estado local descrito arriba.

Decisión vigente del 26/10/2026: usar **acreditación al instante**, sin calendario de cambios de plazo ni rotación entre aplicaciones. Primer lote: **ARS 15.000** (`1_500_000` centavos). La comisión es una condición del proveedor; no se sustituye por un porcentaje enviado desde la web. Las aplicaciones A/B y el laboratorio de cuatro perfiles pertenecen a una prueba cancelada.

Configuración del proveedor verificada el 26/10/2026: después del guardado realizado por el titular, «Costos y cuotas → Checkout» muestra **Al instante / 6,45% antes de IVA y retenciones** para ambos grupos de medios. El laboratorio local fue detenido y retirado del proyecto activo; no hay trabajos programados de cambio de plazo. Se eliminaron las aplicaciones «Taller PM 2026 - Prueba A» y «Prueba B» con autorización del titular; después de recargar el listado solo permanece la integración original «FacturarCodss QR». Esto no habilita por sí solo los cobros del taller.

**Variante elegida para una implementación nueva: Checkout Pro vía Orders API**, no Preferences ni QR. La [documentación oficial de creación](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order) y la [referencia de creación](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/create-order/post) consultadas en la fecha de ejecución indican `POST https://api.mercadopago.com/v1/orders`, `type: online`, `processing_mode: manual`, importes decimales exactos en strings, `external_reference`, `X-Idempotency-Key` (UUID único por intento) y respuesta `checkout_url`. No copiar el `notification_url` de Preferences: en Orders la configuración de webhooks se realiza en la aplicación. No se han probado credenciales de la organización.

La [guía de webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications) describe `x-signature`, secreto configurado en la aplicación y HMAC; **un header presente no prueba autenticidad**. Consultar cada notificación admitida en la API autenticada correspondiente, comprobar receptor, entorno, referencia, ARS, monto congelado y transición de estado; guardar evento antes de responder y reconciliar reintentos. Aislar topics de Orders de topics `payment`/`merchant_order` de otras integraciones; confirmar con documentación y cuentas de prueba cuál recibe efectivamente esta aplicación antes de activar el webhook.

## Pendiente antes de codificar/activar cobros

1. Validar cuenta vendedora Argentina, credenciales de prueba, Webhook secret y URL HTTPS de prueba; no aceptar tokens reales en Git.
2. Verificar campos exactos de respuesta/estados, eventos suscriptos y retorno configurado usando cuenta de prueba y versión de SDK oficial elegida. Fijar un intento de pago por UUID e importe en enteros menores, convertir solo en límite HTTP a decimal exacto `"15000.00"` para el primer lote.
3. Implementar persistencia con migraciones, idempotencia de negocio, deduplicación de webhooks y jobs de conciliación antes del primer cobro de prueba.
4. Simular webhook inválido/repetido/tardío y caída; después realizar pago E2E con dos cuentas de prueba distintas. Sin cuentas, **la verificación real sigue pendiente**.

## Validación operativa del 26 de octubre de 2026

El sector de pagos todavía no puede habilitarse. El precio inicial y la acreditación inmediata están definidos; faltan la conexión del formulario con la base, los dos circuitos de cobro y su confirmación. Esta validación corresponde al entorno `http://localhost:3000` y a la cuenta de Mercado Pago abierta por el titular.

| Parte | Estado observado | Trabajo que falta |
| --- | --- | --- |
| Primer lote | La política del servidor y `/formacion/inscripcion` muestran ARS 15.000. | Leer el lote activo de la base y fijar su importe en cada intento de pago. La inscripción actual no crea un intento ni conserva ese importe. |
| Base y acceso administrativo | No están configuradas `DATABASE_URL`, `WORKSHOP_EVENT_SLUG`, `BETTER_AUTH_SECRET` ni `BETTER_AUTH_URL` en este entorno. `/admin` muestra «Administración local no configurada». | Configurar PostgreSQL del evento, aplicar migraciones, cargar evento/taller/lote y preparar al administrador. |
| Formulario | Al enviar datos ficticios, tanto con «Sí» como con «No» a inconvenientes de pago, muestra «Tus datos todavía no fueron enviados». Las APIs de inscripción y estado responden 503. | Conectar el formulario con el backend. Adaptar nombres/campos: el HTML recoge nombre, apellido y datos adicionales, pero la API solo admite `name`, `email`, `phone` y `accessToken`. |
| Transferencia | `/formacion/contacto` mantiene «Datos de pago por confirmar». La configuración compartida tiene un alias que difiere del observado en la cuenta. | Unificar los datos verificados, mostrar importe y referencia de inscripción, conservar el estado pendiente y agregar conciliación manual autorizada. Una captura no confirma una transferencia. |
| Mercado Pago | Solo permanece la integración de Código QR «FacturarCodss QR». La web no tiene Access Token, secreto de webhook ni origen público configurados. No existe una ruta de creación de checkout. | Preparar la integración definitiva de Checkout Pro, credenciales del servidor, checkout individual, QR de acceso a ese checkout y retornos. No usar el QR de demostración de donaciones para cobrar el taller. |
| Confirmación automática | Existen tablas `payment_attempts`, `webhook_events` y `jobs`; no hay rutas ni procesadores de pagos del taller. | Recibir notificaciones firmadas por HTTPS, consultar la order al proveedor, contrastar referencia/receptor/importe/ARS/entorno y actualizar la base con deduplicación y reintentos. El regreso del navegador no confirma un pago. |
| Inconvenientes para pagar | La opción «Sí» solo despliega un campo de detalles. No guarda una solicitud ni abre el circuito de coordinación. | Guardar la solicitud de asistencia, impedir la creación de pagos para esa rama y ofrecer WhatsApp con una referencia pública. Los detalles de la situación no deben viajar en el enlace de WhatsApp. |
| Operación y documentos | El administrador actual solo muestra cantidades. No hay constancias ni pases del taller. | Agregar revisión de transferencias y asistencia con auditoría, constancia de pago imprimible y pase individual reutilizable al reimprimir. El diseño definitivo del volante se incorpora después. |

### Datos de transferencia que deben unificarse

En la sección de datos de ingreso de la cuenta, Mercado Pago muestra el alias `danielservin.m` y un CVU de 22 cifras. `lib/community-support.ts` todavía contiene `Daniel Servín.mp` y no incluye CVU. Los datos de recepción del taller deben salir de una configuración verificada común con la página principal; esta validación no modificó el destino financiero publicado. No se incluye el CVU completo en este informe.

El QR actual de donaciones se genera con `https://example.org/donacion-prueba` y está rotulado como demostración. No crea ni identifica un pago de inscripción.

### Resultados de pruebas

- Prueba del navegador con datos ficticios: ambos recorridos del formulario terminan en el aviso de recepción no habilitada. No se enviaron mensajes ni se realizaron cobros.
- Comprobación HTTP: `POST /api/inscripciones` y `POST /api/estado` responden 503 con `Cache-Control: no-store` en este entorno.
- `pnpm test`: **6 aprobadas, 1 fallida y 4 omitidas**. La prueba de portada se detiene porque todavía exige «María Auxiliadora»; debe alinearse con el lugar a confirmar y las pantallas actuales. Las omitidas requieren PostgreSQL e incluyen persistencia, concurrencia, límites y administración autenticada.
- Las pruebas de importes y enlaces de WhatsApp pasan. Esto no verifica creación de checkout, notificaciones, transferencias, recibos ni pases.
- Falta la prueba completa con el [entorno de prueba de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/integration-test-introduction): pago aprobado, pendiente y rechazado; cierre sin retorno; notificación duplicada/tardía; importe o receptor contradictorios; devolución; transferencia pendiente/confirmada y rama de asistencia. Probar compra como invitado con los medios que el proveedor habilite para la cuenta.

### Orden para completar el sector

1. Configurar la base y el administrador; guardar la inscripción real con lote, importe, referencia y rama de asistencia.
2. Completar transferencia y su verificación manual con los datos de recepción correctos.
3. Integrar Checkout Pro, los retornos y la confirmación del servidor con una URL HTTPS autorizada. Conservar el estilo del taller y sus transiciones en las nuevas pantallas.
4. Emitir constancia/pase y completar las pruebas de ambos medios, reintentos y estados adversos antes de habilitar cobros.

Los lotes posteriores y sus fechas requieren una definición independiente: la referencia actual del segundo lote también es ARS 15.000 y la del tercero ARS 20.000. Solo se confirmó el nuevo precio del primero; no activar automáticamente los otros dos por esas referencias.

### Reutilización de ML-CODSS

ML-CODSS tiene procesamiento de eventos y simulación de pagos, pero su trabajador de Mercado Pago crea solicitudes de facturación fiscal al aprobar un pago. Su función `orderAsPayment` también transforma el estado agregado `processed` en aprobado sin las comprobaciones de inscripción exigidas aquí. Reutilizar componentes requiere una adaptación explícita: la constancia del taller, el pase y la facturación fiscal son circuitos separados. No se conectó ese trabajador ni se ejecutaron sus simulaciones durante esta validación.

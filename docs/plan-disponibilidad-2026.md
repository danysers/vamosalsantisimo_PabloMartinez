# Plan de disponibilidad de fondos del taller 2026

El organizador confirmó el 27/10/2026 que necesita el dinero tres días antes del encuentro del 19 de diciembre. La fecha objetivo es **16/12/2026**, al comienzo del día en Argentina. Es una previsión sobre los plazos informados por Mercado Pago, no una garantía frente a revisiones, retenciones o pagos aprobados tardíamente.

## Tarifas y calendario

Se consultó la cuenta autenticada del titular en «Costos y cuotas → Checkout → Configurar costos por cobro». La pantalla reúne crédito, débito, dinero en Mercado Pago, cuotas sin tarjeta, prepagas y efectivo. Sus tarifas, **sin IVA ni retenciones**, son:

| Uso previsto | Plazo de disponibilidad | Comisión verificada |
| --- | --- | --- |
| Desde ahora hasta el 10/11/2026 | 35 días | 1,53% |
| Desde el 11/11/2026 | 18 días | 3,48% |
| Desde el 28/11/2026 | 10 días | 4,50% |
| Desde el 06/12/2026 | Al instante | 6,45% |

Las fechas de cambio se consideran a las 00:00 de Argentina. El cálculo escoge la opción de menor comisión que cabe en el margen; si una tarifa futura resulta más cara que otra de menor plazo, puede omitir esa fase. Todos los porcentajes comparados deben tener la misma base impositiva y corresponder a los mismos medios de pago.

El 27/10/2026 se seleccionó **35 días / 1,53%** y se guardó en la cuenta. Tras recargar, esa opción seguía seleccionada y Guardar estaba deshabilitado. La base local registra la configuración observada anterior y la nueva como auditoría, sin modificar inscripciones ni importes ya cotizados.

## Qué se programa y qué requiere intervención

- El sistema calcula la recomendación según la fecha, muestra el calendario y contrasta esa recomendación con el último plazo informado por la organización.
- El panel privado permite editar las tarifas comprobadas, preparar recordatorios opcionales y registrar cada cambio después de guardarlo en Mercado Pago.
- La cuenta de Mercado Pago sigue siendo el lugar donde se cambia el plazo real. No se encontró en la documentación pública de Checkout Pro Orders un parámetro o endpoint para programarlo por orden/aplicación. No se usan endpoints privados ni automatización de una sesión personal de Mercado Pago para cambiar condiciones futuras.
- Crear varias aplicaciones dentro de esta cuenta no se considera una vía verificada para aislar plazos: el control observado corresponde al medio Checkout de la cuenta.
- El organizador autorizó recordatorios a danysers@gmail.com: a las 09:00 cuatro, tres y dos días antes de cada cambio; solamente el día del cambio, uno por hora de 00:00 a 23:00, en Argentina. Se desplegó un servicio SMTP independiente en el entorno `notificaciones` de Dokploy. El calendario completo y su operación están en [el servicio de alertas](../notifications/settlement-alerts/README.md). No depende de que la PC local esté encendida.
- Los avisos antiguos optativos del panel local permanecen desactivados para evitar duplicar este calendario. El registro de un cambio en ese panel no cancela por sí solo los correos del servicio independiente; la cancelación de una fase se hace con el comando documentado del servicio.
- Al llegar al 16/12, los nuevos cobros ya no pueden cumplir el objetivo previo de disponer de esos mismos fondos tres días antes del evento. El panel lo advierte y recomienda la opción inmediata para esos cobros.

Los precios por lote y los gastos de servicio se administran por separado. La comisión de Mercado Pago no se envía como un importe decidido por el navegador ni se interpreta como una acreditación neta garantizada.

## Comprobaciones

Pruebas de cambio de fase antes/después de medianoche argentina, fecha objetivo pasada, comparación con igual base impositiva, rechazo de tarifas incompletas/repetidas, persistencia y auditoría, recordatorios optativos y deduplicados, cancelación al desactivarlos y prohibición de registrar una tarifa distinta de la verificada. El endpoint está cerrado en la superficie pública.

La configuración y la funcionalidad del panel están en el repositorio local. La preferencia de 35 días sí se guardó en la cuenta real de Mercado Pago. El servicio independiente de correos se desplegó en el servidor; no se desplegó una versión nueva del sitio por esta tarea.

Fuentes: [elegir disponibilidad del dinero](https://vendedores.mercadolibre.com.ar/aprender/nota/podes-elegir-cuando-disponer-del-dinero-de-tus-ventas), [Checkout y costos publicados](https://www.mercadopago.com.ar/herramientas-para-vender/check-out), [referencia pública de creación de Orders](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/create-order/post). Las tarifas de esta tabla provienen de la cuenta autenticada y pueden diferir de la tabla comercial general.

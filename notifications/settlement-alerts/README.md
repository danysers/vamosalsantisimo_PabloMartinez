# Recordatorios de disponibilidad de Mercado Pago — Taller 2026

Solicitud autorizada por el organizador: enviar a **danysers@gmail.com** a las 09:00 cuatro, tres y dos días antes de cada cambio, y uno por hora de 00:00 a 23:00 solamente el día del cambio. Zona: **America/Argentina/Buenos_Aires (UTC−3)**. No hay aviso un día antes. Se trata de 81 correos programados, además de un único correo de activación.

| Seleccionar en Checkout | Avisos a las 09:00 | Día de avisos horarios |
| --- | --- | --- |
| 18 días | 07, 08 y 09/11/2026 | 11/11/2026 |
| 10 días | 24, 25 y 26/11/2026 | 28/11/2026 |
| Al instante | 02, 03 y 04/12/2026 | 06/12/2026 |

Las fechas provienen de la meta del 16/12/2026, tres días antes del taller del 19/12, y de los plazos anteriores de 35, 18 y 10 días. Los mensajes indican el plazo que debe seleccionarse, el objetivo y el enlace a la configuración de la cuenta. No hacen cambios en Mercado Pago ni crean aplicaciones o cobros. Las tarifas observadas deben revisarse en la cuenta al guardar cada cambio.

## Despliegue operativo

- Proyecto Dokploy: `vamosalsantisimo-web` (`OershXy4W82adr57LJ4l9`).
- Entorno independiente: `notificaciones` (`tlDXbcA8u0xEmbSv9ffox`). No borrar al limpiar el entorno de pruebas.
- Compose: `Alertas Mercado Pago — Taller 2026` (`TeJ37dDM8I2H6SMhSyJRo`).
- App: `vas-alertas-mp-2026-vaxm0o`; servicio: `alerts`.
- Contenedor inicial: `vas-alertas-mp-2026-vaxm0o-alerts-1`.
- Imagen oficial `node:22-alpine`, Nodemailer fijado en 10.2.1. Sin puertos ni dominios públicos. Reinicio automático `unless-stopped`, límite de 192 MiB y 0,25 CPU.
- Credenciales exclusivamente en el entorno seguro del servicio: `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ALERT_TO`. Nunca guardarlas en este directorio o el compose generado.
- Los volúmenes persistentes `alerts_runtime` y `alerts_state` conservan dependencias y estado entre reinicios. No usar `freshVolumes` ni eliminar esos volúmenes al volver a desplegar.

No requiere un proceso de Codex, la PC local, un cron local ni conexión a la base de pruebas. Tampoco activa el antiguo calendario optativo de `settlement_reminders` del panel local. No hay integración automática entre las confirmaciones de ese panel y este servicio.

## Operación

En la terminal del **servidor**, estado sin secretos:

```sh
docker exec vas-alertas-mp-2026-vaxm0o-alerts-1 node /opt/alerts/worker.mjs --status
docker logs --tail 50 vas-alertas-mp-2026-vaxm0o-alerts-1
```

Después de que el organizador confirme que guardó un cambio en Mercado Pago, se pueden cancelar los avisos restantes de esa fase:

```sh
docker exec vas-alertas-mp-2026-vaxm0o-alerts-1 node /opt/alerts/worker.mjs --ack-phase 18-dias
```

Los otros identificadores válidos son `10-dias` y `al-instante`. Confirmar una fase solo suprime sus avisos pendientes. No cambia la configuración real de Mercado Pago. Para pausar todos los correos, detener solamente este compose en Dokploy; no detener servicios del sitio o PostgreSQL.

## Persistencia y fallos

El proceso revisa cada minuto y persiste el resultado aceptado por SMTP, con identificador de mensaje estable. El correo de activación se envía una sola vez. El estado se escribe de forma atómica y con exclusión entre procesos.

Si el servidor vuelve tras una interrupción, no envía una ráfaga de avisos vencidos: cada aviso horario vence al comenzar la hora siguiente y cada preaviso vence a medianoche. Los rechazos inequívocos de SMTP se reintentan tras cinco minutos, hasta tres veces dentro de la vigencia del aviso. Si una desconexión o caída deja incierto si SMTP lo aceptó, se conserva para revisión y el contenedor pasa a estado no saludable; no se reenvía a ciegas. La aceptación SMTP no garantiza entrega final, por lo que se comprobó también la recepción del correo de activación en Gmail.

El worker queda inactivo fuera del calendario y no repite las fechas en 2027. Si cambian la fecha del taller o los plazos, actualizar el plan explícitamente; no reutilizar un estado con otro `planId`.

## Desarrollo y actualización

Desde la raíz del repositorio:

```sh
node --test tests/settlement-alerts.test.mjs
node notifications/settlement-alerts/worker.mjs --preview
node notifications/settlement-alerts/build-compose.mjs
```

El último comando genera `compose.generated.yaml` (ignorado por Git), que incluye solo el código y el calendario en base64 para un compose de origen `raw`, sin claves. Actualizar el compose existente de Dokploy y desplegar conservando los volúmenes; nunca crear uno duplicado ni sobrescribir las variables de otros servicios.

Verificado al activar: 10 pruebas de calendario, cambios de hora argentina, reintentos, persistencia lógica, cancelación y prevención de duplicados; validación de Docker Compose; conexión SMTP desde el servidor y envío del resumen de activación.

La activación fue el 27/10/2026 a las 23:52 de Argentina (28/10 a las 02:52 UTC), despliegue `6m-LYOk49g7-be-ifJ5NP`. Gmail mostró el correo en Recibidos con el calendario completo. Se reinició el contenedor después del envío: volvió a estado saludable y no volvió a enviar la confirmación. Primer aviso futuro: 07/11/2026 a las 09:00 de Argentina.

# Espera temporal por memoria del servidor

Protección solicitada el 29/10/2026 después de la caída general de Docker.
No cambia pagos, precios, inscripciones, acreditaciones ni datos de asistentes.

## Comportamiento

- Solo se habilita en la aplicación pública mediante `TRAFFIC_GUARD_ENABLED=1`.
- Mide `100 × (1 − MemAvailable / MemTotal)` de `/proc/meminfo`, verificado
  contra el host Oracle desde el contenedor. No usa `MemFree`, la memoria del
  proceso Node ni el límite de memoria del contenedor como memoria del servidor.
- Desde el 90% retiene nuevas navegaciones a las páginas públicas antes de
  renderizarlas o cargar sus imágenes, música y demás recursos. Responde una
  pantalla pequeña con HTTP 503, `Retry-After: 30` y caché deshabilitada.
- El navegador reintenta después de 30–35 segundos, con una pequeña dispersión
  para evitar que todos vuelvan a la vez. Conserva dirección, parámetros y ancla.
  Sin JavaScript, vuelve a intentar a los 30 segundos.
- Si continúa la presión, vuelve a mostrar la espera. No promete ingreso
  después de un plazo fijo. Libera al bajar al 85% para evitar oscilaciones.
- No retiene APIs, webhooks de Mercado Pago, pagos, comprobantes/QR, archivos
  estáticos, solicitudes POST ni el panel privado. Una inscripción que ya se
  está completando puede seguir enviándose. Es una admisión por memoria, no una
  cola con turnos ni una cantidad fija de usuarios simultáneos.
- Si la medición falla, deja pasar la navegación y registra la falla en el
  monitor; evita convertir una métrica ausente en un bloqueo permanente.

## Avisos por correo

El proceso supervisor existente mide cada diez segundos; no agrega otro
contenedor ni otro proceso Node. Envía a `TRAFFIC_ALERT_TO` (en producción,
`danysers@gmail.com`) desde el SMTP ya configurado del sitio. Informa fecha
argentina, porcentaje y memoria total/disponible; no incluye datos de asistentes.
La memoria alta no se presenta como una medición de cantidad de visitantes.

El archivo `alert.json` guarda el último envío aceptado y la próxima tentativa.
Hay un aviso por hora mientras siga sobre el 90%; los errores de SMTP esperan
al menos cinco minutos antes de reintentar. Un candado coordina el solapamiento
de despliegues. Los fallos del monitor no detienen la aplicación.

La confirmación SMTP indica aceptación por el servidor de correo, no lectura ni
recepción en la bandeja. Un envío cuyo resultado se pierda por un corte de red
puede repetirse después del plazo de reintento.

## Configuración de Dokploy

Aplicación pública `pagina-pablo-martinez-njwc9y`:

1. Agregar `TRAFFIC_GUARD_ENABLED=1` y `TRAFFIC_ALERT_TO=danysers@gmail.com` al
   entorno privado existente, conservando las demás variables.
2. Montar el volumen nombrado `vas-traffic-guard-state` en
   `/app/.next/cache/traffic-guard`. La imagen prepara ese directorio para el UID
   no privilegiado 65532. Conserva el volumen en reinicios y despliegues para
   mantener el plazo entre avisos.
3. Cambiar el control de salud para consultar solo
   `http://127.0.0.1:3000/api/taller/configuracion`, manteniendo intervalo,
   tiempo máximo, período de gracia y reintentos existentes. **La portada no
   debe ser una prueba de salud:** su 503 durante la espera es intencional y no
   debe provocar reinicios de Docker.
4. Publicar únicamente una imagen aprobada por CI y el smoke de la imagen ARM64.
   Verificar la lectura real de memoria, el volumen escribible, la configuración
   SMTP y los accesos públicos después del despliegue.

`TRAFFIC_GUARD_MEMINFO_PATH` permite usar un archivo privado de datos ficticios
en pruebas aisladas. No se configura en producción. Ningún parámetro, cookie
o encabezado público puede modificar la medición ni saltarse la espera.

## Validación y desactivación

Las pruebas usan métricas ficticias para verificar umbral, recuperación,
reintentos, privacidad, controles de salud y rutas de pago. Los correos se prueban
con un transporte falso. No se consumen grandes cantidades de RAM ni se generan
pagos o correos reales para ensayar una saturación.

Para desactivar la protección temporal: establecer `TRAFFIC_GUARD_ENABLED=0` y
desplegar nuevamente, conservando el volumen y las demás variables.

La protección depende de que Docker, la red, el proxy y el proceso sigan vivos.
Reduce la carga de nuevos ingresos de esta web; no resuelve la saturación causada
por otros proyectos ni garantiza disponibilidad si se cae el servidor completo.
Sigue pendiente optimizar Oracle y reparar los servicios que reintentan arrancar
con imágenes inexistentes o inaccesibles.

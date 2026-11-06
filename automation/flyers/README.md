# Flyers del evento con Hermes

Origen: **Pablo Martinez 2026 → sponsors-2026**
(`1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68`). Destino:
https://drive.google.com/drive/folders/1QMFs67vBo8rY87oARIVSmxZDd1F-j6fJ

El timer `vas-flyers.timer` revisa cambios cada cinco minutos. Sólo un conjunto
visual nuevo invoca Hermes + ChatGPT. Renombrar un logo o subir un PDF no consume
una generación. El gestor tiene **una única herramienta de composición**, sin
terminal, correo, pagos ni acceso arbitrario al servidor. Se reutiliza la sesión
ChatGPT de Hermes; no requiere FAL ni una clave de la API de imágenes.
El perfil de flyers usa `gpt-6-astra`, validado con la cuenta conectada. Se puede
fijar otro modelo disponible mediante `FLYER_HERMES_MODEL`, sin cambiar el gestor
general. No confiar en los modelos sintéticos que algunas versiones de Hermes
añaden al catálogo: si falla su consulta por descompresión Brotli, consultar el
catálogo real con `Accept-Encoding: identity` antes de elegir el modelo.

`compose.py` parte de los dos PNG V2 aprobados. Modifica exclusivamente las
regiones de sponsors secundarios: historia `(0,1686)-(1080,1842)` y muro
`(0,1186)-(1080,1288)`. Verifica todos los píxeles fuera de esas regiones antes y
después de guardar. Mila Club, su tamaño y posición, Pablo, textos y pie se
conservan exactamente. Los logos mantienen proporción, con hasta siete por fila,
dos filas por página y continuaciones cuando hay más de catorce secundarios.
Los tres logos originales siempre se incluyen. Los logos nuevos son PNG/JPEG/WebP
estáticos de los propietarios autorizados, hasta 4 MiB y 20 millones de píxeles.

Cada cambio genera `flyer-evento-historia-vN.png` y `flyer-evento-muro-vN.png`
(sufijo `-pN` si hay continuaciones), conservando versiones anteriores. El primer
par automático es V3. Una constancia JSON se sube **al final**, después de verificar
las sumas de los archivos. La web sólo publica pares completos y mantiene el
último correcto ante errores. El worker de sponsors sincroniza también esos
pares cada cinco minutos; el colgante, vista previa, descarga y compartir usan
la misma versión. El modal ofrece además descarga para muro y continuaciones.

## Instalación Oracle

Código `/opt/vas-flyers`; entorno Pillow separado en `/opt/vas-flyers/venv`;
estado y trabajos privados `/var/lib/vas-flyers`; credenciales Drive sólo en
`/etc/vas-flyers.env` (0600), reutilizadas de la configuración privada existente.
Hermes se ejecuta con la instalación existente y un perfil de trabajo separado,
sin reemplazar el modelo/configuración del gateway general.
En Hermes con PM, el worker consulta `pm.environments --format json` y ejecuta
el gestor con el Python y las dependencias seleccionados por esa instalación.
Si esa selección falla, se detiene; no vuelve silenciosamente a un Python viejo.
El gestor activa `hermes_bootstrap` antes de importar autenticación. El compositor
se ejecuta en modo Python aislado (`-I`) para que las dependencias de Hermes no
se mezclen con el entorno Pillow, que puede usar otra versión de Python.
Las instalaciones anteriores conservan su ruta `venv/bin/python`. Las
credenciales OAuth de Drive no se pasan al proceso del gestor.

El perfil dedicado de flyers debe conservar la herramienta directa, sin el
catálogo general introducido en Hermes 0.23:

```yaml
tools:
  tool_search:
    enabled: "off"
```

El guard de `hermes_job.py` exige que el agente exponga únicamente
`generate_event_flyers` antes de hacer una solicitud al modelo.

El servicio se serializa por `flock`, limita CPU al 40%, memoria a 1536 MiB y
pospone trabajos cuando la memoria disponible del host cae por debajo del 15%.
No abre puertos. La cola y las cargas son idempotentes; un fallo se reintenta en
el siguiente ciclo y no reemplaza los flyers vigentes.

Operación: `systemctl status vas-flyers.timer`, `journalctl -u vas-flyers.service`,
`systemctl start vas-flyers.service` para revisión manual, `systemctl stop
vas-flyers.timer` para pausar. El log detallado de Hermes queda privado junto al
trabajo. Si vence ChatGPT, renovar con `hermes auth add openai-codex --type oauth`.
Telegram queda pendiente para otra versión.

Pruebas: `python -m unittest discover -s automation/flyers -p 'test_*.py'`
y `node --test tests/flyer-sync.test.mjs tests/flyer-feed.test.mjs`.

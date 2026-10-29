# Dominio principal — 29/10/2026

El sitio público está publicado en `https://vamosalsantisimo.com`, con `https://pablomartinez.vamosalsantisimo.com` como alias completo. Ambos llegan a la misma aplicación y base de datos. El panel conserva `https://paneltaller2026.vamosalsantisimo.com/admin`.

Configuración del sitio: `SITE_ORIGIN=https://vamosalsantisimo.com`, `MP_PUBLIC_ORIGIN=https://vamosalsantisimo.com`, `PUBLIC_SITE_ALIASES=https://pablomartinez.vamosalsantisimo.com`. La validación de origen usa una lista exacta, sin comodines ni confianza en cabeceras reenviadas. Los dos sitios funcionan sin redirigir al visitante entre orígenes, conservando el acceso al pago guardado en sessionStorage.

Los nuevos checkout de Mercado Pago vuelven al origen autorizado desde el que fueron iniciados. Las órdenes ya creadas conservan su URL guardada; el dominio anterior y su webhook deben seguir operativos. Cambiar dominio no requiere cambiar credenciales, vendedor ni clave de firma.

La aplicación de Mercado Pago es `1258485942121950` (Vamos al Santisimo - Taller). Revisar la URL del sitio y la URL productiva de Webhooks en su panel. La nueva URL del webhook debe ser la misma ruta existente con el dominio principal; no guardar tokens ni la clave secreta en este documento. Si el panel de Mercado Pago exige verificación adicional, conservar la configuración anterior hasta poder verificar y guardar la nueva.

En Cloudflare, la ruta exacta `vamosalsantisimo.com` del túnel `vamosalsantisimo` debe usar el mismo puente a Traefik que el wildcard. En Dokploy, la ruta raíz del dominio se asigna a Página Pablo Martínez en puerto 3000; deshabilitar la ruta raíz de Página temporal para evitar dos destinos. Conservar su contenedor para recuperación y las rutas específicas del taller anterior.

`www.vamosalsantisimo.com` redirige al principal manteniendo ruta y parámetros. `/taller` y sus subrutas redirigen a `/formacion`. El logo de correos ya enviados sigue disponible en `/logo-vamos.png`. Las páginas estáticas públicas declaran canonical al dominio principal.

Validación: pruebas de los dos orígenes y rechazo de dominios ajenos, retorno de checkout y rechazo de redirecciones arbitrarias; pruebas HTTP de las seis rutas públicas con validación de origen, canonical, enlaces antiguos y logo. Verificar HTTPS, inscripción y APIs después de cambiar el enrutamiento, sin crear cobros ni inscripciones reales para probar.

## Resultado verificado

Código `035c082`, [pipeline 40909213670](https://github.com/danysers/vamosalsantisimo_PabloMartinez/actions/runs/40909213670) exitoso: 145 pruebas, 144 aprobadas, ninguna fallida y una omitida. Imagen ARM64 arrancada y escaneada antes de publicar. Despliegue público del 29/10/2026 16:17:52 UTC terminado correctamente.

Cloudflare confirmó la actualización de la ruta raíz hacia el puente. Dokploy tiene las rutas principales del proyecto: `pablomartinez` (58), `www` (62) y dominio raíz (63); la ruta raíz de Página temporal (53) está deshabilitada, sin eliminar el contenedor. El panel no tenía SITE_ORIGIN/MP_PUBLIC_ORIGIN y conserva PANEL_ORIGIN/BETTER_AUTH_URL; no se cambiaron esos valores.

Verificación externa con HTTPS válido: portadas 200 con contenido idéntico, inscripción/configuración 200, inscripciones abiertas y Mercado Pago configurado; las seis APIs rechazan cuerpos vacíos con 400 desde cada dominio autorizado y rechazan un origen ajeno con 403. `/admin` devuelve 404 en los dominios públicos y 200 en el panel privado. `www` redirige con 308; `/taller` redirige a `/formacion`. Logo de correos anteriores 200. Los dos endpoints de webhook responden 401 a solicitudes sin firma.

Pendiente en el panel de Mercado Pago: al abrir la aplicación se mostró **“Alcanzaste el límite de intentos”**, con posibilidad de otra verificación o espera de 24 horas. No se pudieron leer ni modificar los valores guardados de la ficha/Webhooks. El usuario fue avisado y la pestaña quedó disponible para verificar acceso. El endpoint anterior sigue disponible, por lo que la migración no exige interrumpir notificaciones a esa dirección. Cuando se pueda ingresar, revisar:

- Sitio web principal: `https://vamosalsantisimo.com`.
- URL productiva de Webhooks propuesta: `https://vamosalsantisimo.com/api/mercado-pago/webhook`.
- Endpoint anterior conservado: `https://pablomartinez.vamosalsantisimo.com/api/mercado-pago/webhook`.

No se regeneraron credenciales ni claves de firma, no se crearon órdenes de cobro y no se ejecutó un pago real como prueba. Verificar una configuración de checkout no equivale a demostrar un cobro real.

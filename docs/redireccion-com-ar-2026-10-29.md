# Redirección de vamosalsantisimo.com.ar — 29/10/2026

## Causa verificada

El dominio `.com.ar` estaba delegado a `ns1.donweb.com` y `ns2.donweb.com`, con un registro A a `200.58.112.250` y `www` como CNAME del dominio raíz. El reenviador de Donweb ya tenía guardado `https://vamosalsantisimo.com` como destino. Por HTTP devolvía una página con meta refresh, sin conservar rutas; por HTTPS, tanto raíz como www fallaban con `ERR_SSL_WRONG_VERSION_NUMBER` antes de ejecutar el salto.

La zona Donweb solo contenía A, CNAME, NS y SOA; no había registros de correo. No era un error del código de la página principal ni del retorno de Mercado Pago.

## Configuración aplicada

Se creó `vamosalsantisimo.com.ar` en la cuenta existente de Cloudflare, plan gratuito, y se implementó una regla habilitada llamada **Dominio .com.ar al sitio principal**:

- Coincidencia: todas las solicitudes entrantes de esta zona.
- Tipo: dinámico.
- Destino: `concat("https://vamosalsantisimo.com", http.request.uri.path)`.
- Estado: 301 permanente.
- Conservar cadena de consulta: habilitado.

La zona tiene registros A para raíz y www, ambos con proxy habilitado. Conservan `200.58.112.250` como respaldo durante la activación: Cloudflare responde con la IP de origen mientras una zona está pendiente. Esto permite seguir usando el reenviador HTTP anterior durante la transición; una vez activa, la regla redirige antes de consultar el origen. La zona antigua de Donweb se conserva.

En Donweb se guardaron y verificaron después de recargar estos nameservers, asignados específicamente a `.com.ar`:

- `kara.ns.cloudflare.com`
- `ridge.ns.cloudflare.com`

Se solicitó a Cloudflare comprobar la nueva delegación. No se modificaron los DNS de `.com`, el túnel, el panel, la base de datos ni la aplicación de Mercado Pago. No hubo cobros ni nuevas inscripciones de prueba.

## Estado y comprobación pendiente

Donweb confirmó el cambio. Cloudflare sigue indicando **esperando propagación de nameservers** y los resolutores públicos consultados todavía devuelven los nameservers anteriores. La redirección HTTP anterior continúa disponible; las portadas principal y de Pablo responden 200.

La verificación completa de HTTPS queda pendiente de la propagación y emisión de Universal SSL. El simulador de Cloudflare tampoco pudo evaluar la solicitud HTTPS mientras faltaba el certificado; la variante HTTP informó que no podía recopilar el trace de la zona pendiente. No hay un resultado satisfactorio de simulación ni de HTTPS que atribuir a esas comprobaciones.

Después de la activación, comprobar con validación TLS normal raíz y www, por HTTP y HTTPS. Deben devolver 301 hacia el dominio principal, conservando ruta y parámetros, y terminar en la página correcta. No omitir errores de certificado para considerar exitosa esa prueba. Para volver al reenviador anterior, restaurar solamente los nameservers de `.com.ar` a `ns1.donweb.com` y `ns2.donweb.com`; conservar la configuración y no eliminar zonas durante una comprobación de propagación.

Referencias: [redirección entre dominios](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/), [limitaciones en zonas pendientes](https://developers.cloudflare.com/dns/proxy-status/limitations/), [activación de Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/enable-universal-ssl/).

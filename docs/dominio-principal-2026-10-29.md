# Dominio principal — 29/10/2026

El sitio público se prepara para `https://vamosalsantisimo.com`, con `https://pablomartinez.vamosalsantisimo.com` como alias completo. Ambos deben llegar a la misma aplicación y base de datos. El panel conserva `https://paneltaller2026.vamosalsantisimo.com/admin`.

Configuración del sitio: `SITE_ORIGIN=https://vamosalsantisimo.com`, `MP_PUBLIC_ORIGIN=https://vamosalsantisimo.com`, `PUBLIC_SITE_ALIASES=https://pablomartinez.vamosalsantisimo.com`. La validación de origen usa una lista exacta, sin comodines ni confianza en cabeceras reenviadas. Los dos sitios funcionan sin redirigir al visitante entre orígenes, conservando el acceso al pago guardado en sessionStorage.

Los nuevos checkout de Mercado Pago vuelven al origen autorizado desde el que fueron iniciados. Las órdenes ya creadas conservan su URL guardada; el dominio anterior y su webhook deben seguir operativos. Cambiar dominio no requiere cambiar credenciales, vendedor ni clave de firma.

La aplicación de Mercado Pago es `1258485942121950` (Vamos al Santisimo - Taller). Revisar la URL del sitio y la URL productiva de Webhooks en su panel. La nueva URL del webhook debe ser la misma ruta existente con el dominio principal; no guardar tokens ni la clave secreta en este documento. Si el panel de Mercado Pago exige verificación adicional, conservar la configuración anterior hasta poder verificar y guardar la nueva.

En Cloudflare, la ruta exacta `vamosalsantisimo.com` del túnel `vamosalsantisimo` debe usar el mismo puente a Traefik que el wildcard. En Dokploy, la ruta raíz del dominio se asigna a Página Pablo Martínez en puerto 3000; deshabilitar la ruta raíz de Página temporal para evitar dos destinos. Conservar su contenedor para recuperación y las rutas específicas del taller anterior.

`www.vamosalsantisimo.com` redirige al principal manteniendo ruta y parámetros. `/taller` y sus subrutas redirigen a `/formacion`. El logo de correos ya enviados sigue disponible en `/logo-vamos.png`. Las páginas estáticas públicas declaran canonical al dominio principal.

Validación: pruebas de los dos orígenes y rechazo de dominios ajenos, retorno de checkout y rechazo de redirecciones arbitrarias; pruebas HTTP de las seis rutas públicas con validación de origen, canonical, enlaces antiguos y logo. Verificar HTTPS, inscripción y APIs después de cambiar el enrutamiento, sin crear cobros ni inscripciones reales para probar.

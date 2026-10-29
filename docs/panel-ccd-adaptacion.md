# Adaptación del panel CCD 2.0 al taller

## Referencia

Repositorio de consulta: `danysers/CCD2.0`, carpeta `panel-retirodedicados` (revisión de `main` en `4e4efc8`). La copia local está en una carpeta hermana del proyecto del taller y no forma parte de este repositorio.

El panel de referencia usa Vite, React Router, Tailwind y servicios orientados al esquema CCD. En su `src/router/index.tsx` actual solo están conectadas las rutas de acceso y Dashboard, aunque existen páginas adicionales para personas, eventos, inscripciones, grupos y reportes. Esas páginas no se pueden trasladar sin adaptar sus modelos, permisos y API.

## Lo adaptado aquí

- Cabecera, menú lateral responsivo, migas de navegación, tarjetas y tablas de estilo operativo claro.
- Resumen con datos reales del evento, inscripciones recientes, métricas y atajos.
- Consulta privada de inscripciones con búsqueda, filtros de estado y paginación en el servidor; acceso directo a la revisión de cada referencia. Los pagos grupales se muestran por integrante con su importe asignado, incluso cuando el pagador es otra persona.
- Navegación por secciones en lotes, comisiones, promociones, grupos, comprobantes, pagos y control de ingreso.
- Conservación de los formularios y operaciones existentes del taller, sin reemplazar su lógica de precios, verificación, QR o correos.

## Límites deliberados

- No se importa la autenticación de CCD ni sus tokens en `localStorage`. El taller conserva Better Auth, roles operativos, rutas separadas de panel y web, y API privada.
- No se copia la base de datos CCD ni se conectan sus servicios: las consultas del panel siguen usando PostgreSQL del taller y filtran por el evento configurado.
- La nueva lista de inscripciones es de consulta. Las transiciones de pago y acreditación siguen exclusivamente en las pantallas autorizadas y con confirmación humana.
- La publicación del código en `main` no crea ni habilita por sí sola un servicio de panel en Dokploy; ese servicio conserva su configuración privada y debe verificarse por separado.

## Próxima iteración sugerida

Probar el panel con una base de desarrollo migrada y un operador de cada rol, revisar la vista móvil y ajustar juntos prioridades visuales. Después se pueden sumar reportes y exportaciones del taller con permisos y datos propios, inspirados en las páginas de CCD que hoy no están conectadas a su router.

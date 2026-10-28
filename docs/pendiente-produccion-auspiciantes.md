# Pendiente para publicar los auspiciantes automáticos

Estado al 28/10/2026. **Este archivo no contiene credenciales.** La corrección visual y el sincronizador de Drive están implementados en el repositorio local, pero un commit por sí solo no actualiza la web pública.

## Antes de configurar credenciales

- [ ] Subir a GitHub el commit de auspiciantes cuando se decida publicar. El servicio de producción toma la imagen construida desde `main`; verificar que Dokploy haya desplegado el nuevo digest. No modificar los otros servicios del proyecto.
- [ ] Comprobar en la web publicada que Mila Club se ve primero y que Alma Verde, Cabildo y Las Kalas siguen visibles. En escritorio, los logos adicionales deben ocupar cuatro columnas; en móvil, dos.
- [ ] Revisar los permisos de edición de la [carpeta de auspiciantes](https://drive.google.com/drive/folders/1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68). Actualmente figura «cualquier persona con el enlace: editor». Es preferible limitarla a las cuentas que subirán logos. El sincronizador solo publicará imágenes cuyos propietarios estén en la lista permitida.

## Con credenciales, en Dokploy

- [ ] Crear o reutilizar una aplicación OAuth de Google con Drive API habilitada y acceso de **lectura** a esa carpeta. Autorizarla con una cuenta que realmente pueda enumerar y descargar sus archivos; obtener un refresh token con acceso offline. No pegar secretos en el chat ni en Git.
- [ ] En las variables **privadas** de la aplicación pública `Página Pablo Martínez`, establecer `DRIVE_OAUTH_CLIENT_ID`, `DRIVE_OAUTH_CLIENT_SECRET` y `DRIVE_OAUTH_REFRESH_TOKEN`. La conexión de Drive de Codex no sirve como credencial del contenedor.
- [ ] Establecer `SPONSOR_SYNC_ENABLED=1`, `SPONSOR_DRIVE_FOLDER_ID=1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68` y `SPONSOR_DRIVE_OWNER_EMAILS` con las cuentas autorizadas para subir imágenes (inicialmente `vamosalsantisimof@gmail.com,danysers@gmail.com`). No habilitar el trabajador del panel por error.
- [ ] Redesplegar **solo** la aplicación pública para aplicar las variables. Verificar en sus logs que el sincronizador inicia sin errores de OAuth/Drive y que `/api/sponsors` responde con `available: true`.
- [ ] Subir un PNG, JPG o WebP de hasta 4 MiB desde una cuenta incluida en `SPONSOR_DRIVE_OWNER_EMAILS`. El trabajador revisa Drive cada cinco minutos y la página abierta consulta el resultado cada cinco minutos más (o al recargar/volver a la pestaña). Debe aparecer debajo de las tres marcas locales, con el nombre del archivo como texto alternativo. Verificar que una imagen de otro propietario o formato no admitido no se publique.
- [ ] Borrar el logo de prueba de Drive y comprobar que desaparezca de la galería tras la siguiente sincronización, sin afectar los cuatro logos originales.

## Operación posterior

- [ ] Decidir si el caché de logos necesita un volumen persistente. Ahora usa el directorio temporal y se reconstruye tras reiniciar. Con más de una réplica sería obligatorio compartirlo o mover los archivos a almacenamiento común.
- [ ] Vigilar fallos de sincronización en los logs y renovar el refresh token si Google lo revoca. Los cuatro logos locales permanecen visibles aun cuando Drive falle.

## Ya realizado, no repetir

- [x] Se quitó el Basic Auth **solo de la web pública** en Dokploy. La portada respondió HTTP 200 sin credenciales el 28/10/2026. La autenticación del panel administrativo no se tocó.
- [x] La corrección local de los logos se verificó en el navegador y pasaron `pnpm typecheck`, `pnpm lint` y `pnpm test` (108 pruebas correctas; 16 omitidas por requerir una base descartable).

Detalles técnicos y variables: [auspiciantes-drive.md](auspiciantes-drive.md).

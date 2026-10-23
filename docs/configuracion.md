# Configuración de desarrollo (sin secretos)

**No se entrega `.env.example`: la herramienta impidió crear esa ruta.** Creá un archivo de configuración local ignorado por Git según el mecanismo del hosting; nunca lo subas ni copies credenciales del sitio anterior.

| Variable privada | Uso | Ejemplo ficticio |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 2026, privado; requerido para migraciones y nuevas inscripciones | **No incluir en ejemplos** |
| `WORKSHOP_EVENT_SLUG` | Identifica el evento disponible; no aceptar IDs de inscripción del cliente | `adoracion-2026` |
| `RATE_LIMIT_HMAC_KEY` | Clave privada aleatoria de al menos 32 bytes para buckets de limitación | **No incluir en ejemplos** |
| `BETTER_AUTH_URL` | Origen exacto de la administración; solo loopback HTTP en el preview | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Secreto aleatorio NUEVO para firmar sesiones; al menos 32 caracteres | **No incluir en ejemplos** |
| `TRUST_REVERSE_PROXY` | `1` solo si el reverse proxy controla `x-real-ip`; si no, límite global | `0` |
| `MYSQL_HOST` | Host de base heredada solo durante migración | `db.invalid` |
| `MYSQL_PORT` | Puerto de MySQL | `3306` |
| `MYSQL_USERNAME` | Cuenta de base | `example_user` |
| `MYSQL_PASSWORD` | Contraseña nueva de base | **No incluir en ejemplos** |
| `MYSQL_DATABASE` | Base de migración | `event_example` |
| `APP_URL` | URL HTTPS canónica solo cuando se habiliten callbacks futuros; NO configurarla para el preview local | **Pendiente** |
| `MERCADO_PAGO_ACCESS_TOKEN` | Token de la cuenta receptora, entorno correspondiente | **No incluir en ejemplos** |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Secreto de validación del webhook | **No incluir en ejemplos** |
| `ORGANIZATION_WHATSAPP_E164` | WhatsApp público de la organización; la vista local usa el número confirmado por el usuario | `5493704258770` |

## Administrador privado (solo localhost)

El borrador público puede verse sin PostgreSQL con `pnpm install --frozen-lockfile` y `pnpm dev`, en `http://localhost:3000`. En ese caso `/admin` muestra «Administración local no configurada» y la API de autenticación responde 503; no hay cuenta predeterminada.

Para habilitar **una cuenta inicial** en una base PostgreSQL 2026 aislada, desde `site/`:

1. Configurá `DATABASE_URL` **fuera de Git** para esa base; no uses la base ni las credenciales heredadas. Configurá `BETTER_AUTH_URL=http://localhost:3000` en la misma terminal. Generá `BETTER_AUTH_SECRET` con al menos 32 caracteres aleatorios y guardalo de manera persistente en tu gestor local de secretos: reiniciar con otro secreto invalida sesiones. En Git Bash podés generar el valor sin imprimirlo: `export BETTER_AUTH_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"`. No copies claves en tickets ni en el chat.
2. Aplicá las migraciones con `pnpm exec drizzle-kit migrate` **solo después de comprobar** que `DATABASE_URL` apunta a la base correcta; no migrés datos existentes sin un plan de backup.
3. Ejecutá `pnpm exec auth create-admin --config ./scripts/auth-cli.ts --email admin@localhost.test --name "Vamos al Santísimo" --role admin --data '{"username":"vamosalsantisimo.admin"}'`. **No incluyas `--password`**: la herramienta te pide una contraseña **NUEVA**, de 14 caracteres o más, en la terminal interactiva. Si ya hay usuarios, el CLI **pide confirmación** para crear otra cuenta: cancelá el proceso; no uses `--force` ni `--yes`. El email `.test` es solo un alias local, sin entrega ni recuperación por correo: reemplazarlo por un email verificable y configurar recuperación antes de cualquier despliegue. Confirmá luego que `/admin` acepta `vamosalsantisimo.admin` y que «Cerrar sesión» invalida la sesión **solo cuando el servidor confirma la operación**. Si aparece un error de cierre, la sesión puede seguir activa: reintentá o borrá los datos del sitio antes de dejar el equipo.
4. Iniciá `pnpm dev` en esa misma configuración y abrí `http://localhost:3000/admin`. La vista privada actual muestra **solo cantidades**; todavía no edita lotes, inscripciones ni confirma pagos. El acceso se comprueba del lado del servidor con sesión y rol actual de PostgreSQL. El login usa limitación de intentos persistente y no hay alta pública. Los intentos de acceso y los errores se registran en salida estándar como JSON con identificador de correlación, sin contraseña, email, usuario, cookie ni token; esos logs locales no son una auditoría durable de pagos, que permanecen deshabilitados.

Si la máquina se comparte, no dejes el servidor ni la sesión abiertos; el proceso escucha únicamente en localhost. La base descartable de pruebas se detiene al terminar y no contiene la cuenta de operación.

Dominio previsto para cuando se decida desplegar: `taller.vamosalsantisimo.com.ar`. Por ahora levantar solo en `localhost`; no configurar canónica/HTTPS externo ni indexar el borrador. Abrir WhatsApp no inscribe ni confirma pagos. El mensaje general no incluye datos personales ni token.

En el sitio público, **no** están habilitados aún inscripciones ni pagos. El esquema nuevo usa PostgreSQL; los `MYSQL_*` se conservan únicamente para una migración explícita si la organización la autoriza. La contraseña heredada requiere rotación. Las variables previstas para esas integraciones no deben considerarse configuradas o efectivas hasta que sus tareas estén implementadas y probadas. Rotá inmediatamente la antigua contraseña de base de datos que estuvo publicada en el repositorio de 2025; quitarla del código nuevo no la revoca. No activar credenciales de producción durante pruebas.

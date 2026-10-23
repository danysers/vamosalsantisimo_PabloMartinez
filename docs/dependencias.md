# Dependencias y verificación — edición 2026

El proyecto anterior tenía dos lockfiles, Next 15.2.4, React 19, `vaul` 0.9.9 y `mysql2` 3.x. Por instrucción posterior del usuario se usa **solo pnpm 11.27.1 y `pnpm-lock.yaml`**: `pnpm install --frozen-lockfile` es la instalación reproducible. Las referencias a npm en el historial de trabajo describen pruebas anteriores, no son instrucciones vigentes. Runtime local: Node 22.17.1; Next 16.4.2 declara Node >=20.9.0. pnpm aprobó únicamente los scripts nativos de `esbuild` y `unrs-resolver` en `pnpm-workspace.yaml`; no se exceptúan versiones nuevas de la política de antigüedad del registro.

| Paquete directo | Antes | Objetivo aplicado | Motivo y comprobación |
| --- | --- | --- | --- |
| Next.js | 15.2.4 | 16.4.2 | Línea estable compatible con Node 22 y React 19; build, lint y tipos reales. Remueve alerta runtime de PostCSS/Next que persistía en Next 15.5.28. |
| React | `^19` | compatible 19.x instalado por lockfile | Conservar componente público y compatibilidad con Next 16. |
| vaul | `^0.9.9` | 1.1.2 | Peer de React 19, permite instalación sin `--force`. |
| Drizzle ORM / Kit | ausentes | 0.45.4 / 0.31.11 | Esquema PostgreSQL y migraciones SQL versionadas; `drizzle-kit migrate` probado en instancia aislada. Kit solo desarrollo. |
| pg | ausente | 8.23.1 | Conexión PostgreSQL servidor, sin exponer URL en cliente. |
| Better Auth / adaptador Drizzle / CLI | ausentes | 1.7.7 (fijos) | Sesiones, hash de contraseñas, bootstrap interactivo y rate limit DB solo en localhost; la versión 1.7.11 se descartó por política de antigüedad activa de pnpm. |
| Zod | 3.25.67 | 4.6.7 | Peer requerido por Better Auth. La comparación diferencial detectó que `z.string().uuid()` rechaza UUID v9 antes admitidos; la API conserva la forma hexadecimal previa y tiene regresión HTTP en PostgreSQL aislado. |
| ESLint / configuración Next | anteriores | 10.x / 16.4.2 | `pnpm lint` sobre rutas y casos de uso modificados; plugin React transitivo declara peer hasta ESLint 9. El lint real y la instalación limpia son el criterio; no forzar peers. |

## Auditoría y riesgo residual

La auditoría anterior a Better Auth (con el antiguo gestor) había hallado 0 vulnerabilidades runtime y 9 en herramientas de desarrollo. En el **árbol actual de pnpm**, `pnpm audit --prod` reporta **1 moderada** (`esbuild <=0.24.2`, arrastrado como peer opcional `drizzle-kit` de Better Auth); `pnpm audit` completo reporta **2**: esa moderada más **1 alta** (`braces` mediante `eslint-config-next`/`fast-glob`/`micromatch`). Esos avisos tratan un servidor de desarrollo de esbuild y patrones profundamente anidados de lint, respectivamente; no se habilita el servidor esbuild desde el sitio. Sin embargo, siguen presentes en la cadena y **no** se declaran resueltos ni se fuerza un override incompatible. Mantener herramientas en localhost y revisar parches compatibles antes de despliegue. No usar arreglos forzados para bajar Next o forzar incompatibilidades; confirmar con `pnpm audit` y `pnpm audit --prod` en próximas actualizaciones.

No hay imagen de producción definida. Se usaron contenedores PostgreSQL **descartables** locales (`postgres:17.6-alpine` para las pruebas previas; `postgres:16-alpine` para migración/autenticación). No se ha probado Docker/ARM64 del hosting, despliegue, backup ni restauración.

Fuentes consultadas: [upgrade Next 16](https://nextjs.org/docs/app/guides/upgrading/version-16), [Drizzle schema](https://orm.drizzle.team/docs/sql-schema-declaration), [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-generate), metadatos del registro consultados con `pnpm view` y avisos de `pnpm audit`. Las versiones son las observadas en esta ejecución, no se promete que sean las últimas al publicar.

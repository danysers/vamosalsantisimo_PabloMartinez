# Authentik: rollout controlado del panel

Estado: integración Authentik-only activa en la aplicación privada del panel. No habilitar en la aplicación pública.

Solo servicio privado `APP_SURFACE=panel`; nunca activar en la aplicación pública.

Variables privadas en Dokploy:

```
AUTHENTIK_ENABLED=1
AUTHENTIK_ONLY=1
AUTHENTIK_IDENTITIES=<JSON de 3 sujetos verificados: sub, username local esperado y role>
AUTHENTIK_DISCOVERY_URL=https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/.well-known/openid-configuration
AUTHENTIK_CLIENT_ID=<ID del proveedor exclusivo del panel>
AUTHENTIK_CLIENT_SECRET=<secreto del proveedor; nunca versionar>
```

Better Auth 1.7.7 usa `/api/auth/callback/authentik` y POST `/api/auth/sign-in/social` con `provider=authentik`. No usa los endpoints antiguos `/oauth2/*`. Authorization Code con PKCE, firma/JWKS obligatoria, origen HTTPS exacto. Sin altas públicas ni vinculación implícita por correo; no se modifican roles desde claims ni campos editables del cliente.

Con `AUTHENTIK_ONLY=1`, una visita no autenticada a `/admin` redirige en el servidor directamente a Authentik, sin renderizar la pantalla intermedia de acceso. El endpoint de inicio solo acepta el destino HTTPS exacto de autorización de `aute.codss.com.ar` y conserva las cookies de estado/PKCE generadas por Better Auth. Si el inicio falla, `/admin?authError=1` muestra el botón de reintento.

El proveedor OIDC de Authentik debe usar el flujo de invalidación `default-invalidation-flow` (Logout), no `default-provider-invalidation-flow` (Logged out of application): el segundo conserva la sesión SSO de Authentik. El botón de cierre envía un POST de navegación al endpoint local `/api/auth/authentik-logout`; el servidor invoca el sign-out de Better Auth, borra la sesión local y redirige al `end_session_endpoint` OIDC validado para la aplicación. Authentik retorna a `/admin`, que inicia otra vez el flujo y muestra su pantalla de acceso; eso permite cambiar de usuario. Este cierre también finaliza la sesión SSO compartida por otras aplicaciones de Authentik en ese navegador.

## Controles de operación y regresión

1. La aplicación Authentik solo permite al grupo `vamosalsantisimo-sponsor` y a `danysers`. Las otras aplicaciones excluyen Sponsor sin alterar sus políticas existentes.
2. AUTHENTIK_IDENTITIES contiene los tres sujetos inmutables comprobados en la previsualización del proveedor. La identidad administradora está ligada al usuario local existente con rol configuration; se preservan IDs e historial. La selección se hace por sub verificado, nunca por correo o nombre de usuario enviado por el navegador.
3. El callback provisiona transaccionalmente solo esos sujetos, después de verificar firma/nonce/issuer/audience; exige pertenencia a vamosalsantisimo-sponsor para sponsors y respeta baneos/deshabilitaciones y colisiones. Sin altas generales. No se registra el plugin de administración Better Auth cuando OIDC está activo; role=admin en la tabla histórica solo mantiene compatibilidad con las comprobaciones operativas del panel.
4. En regresión, probar redirección directa, cierre de sesión local y SSO, rechazo de usuario no autorizado, Sponsor sin acceso a URLs/API de pagos/inscripciones/configuración y danysers con acceso completo.
5. Conservar `AUTHENTIK_ONLY=1`: el login local y sus endpoints quedan deshabilitados. Ocultar el formulario no deshabilita autenticación.

Rollback controlado: cambiar `AUTHENTIK_ONLY=0` y `AUTHENTIK_ENABLED=0`, luego redeploy para reactivar el inicio local según las políticas configuradas. El cierre de sesión de Authentik finaliza el SSO del navegador, por lo que otras aplicaciones pueden pedir autenticación nuevamente.

Migración inicial (histórico): `AUTHENTIK_LINK_SINGLE_ADMIN` debe permanecer en `0` después del primer vínculo. Si una recuperación futura requiere `1`, solo acepta la única cuenta local activa con rol configuration y auth_role admin, rechaza candidatas ambiguas/bloqueadas y colisiones, y no cambia roles ni crea otro administrador.

# Authentik: rollout controlado del panel

Estado: integración opcional en código, pendiente de vinculación de identidades y prueba de producción. No retirar el login local todavía.

Solo servicio privado `APP_SURFACE=panel`; nunca activar en la aplicación pública.

Variables privadas en Dokploy:

```
AUTHENTIK_ENABLED=1
AUTHENTIK_DISCOVERY_URL=https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/.well-known/openid-configuration
AUTHENTIK_CLIENT_ID=<ID del proveedor exclusivo del panel>
AUTHENTIK_CLIENT_SECRET=<secreto del proveedor; nunca versionar>
```

Better Auth 1.7.7 usa `/api/auth/callback/authentik` y POST `/api/auth/sign-in/social` con `provider=authentik`. No usa los endpoints antiguos `/oauth2/*`. Authorization Code con PKCE, firma/JWKS obligatoria, origen HTTPS exacto. Sin altas públicas ni vinculación implícita por correo; no se modifican roles desde claims ni campos editables del cliente.

## Antes del corte

1. Verificar que la aplicación Authentik solo permite al grupo `vamosalsantisimo-sponsor` y a `danysers`. Revisar todas las vinculaciones guardadas; ANY entre esas dos.
2. Vincular explícitamente la identidad OIDC de danysers a su usuario local existente mediante `/api/auth/link-social` con sesión local y mismo correo. Conservar `user.id`/`admin_users.id` para no perder la auditoría. No asociar por nombre de usuario ni por un correo sin prueba de propiedad.
3. Provisionar las otras identidades OIDC por su `sub` inmutable, con rol operativo `sponsor`, sin administración global. La integración actualmente rechaza altas nuevas: es intencional hasta completar este paso. No activar las cuentas Authentik antes de revisar acceso a las demás aplicaciones existentes.
4. Probar inicio y cierre, rechazo de usuario no autorizado, Sponsor sin acceso a URLs/API de pagos/inscripciones/configuración y danysers con acceso completo.
5. Solo tras esa comprobación retirar el formulario y deshabilitar endpoints locales de contraseña. Ocultar el formulario no deshabilita autenticación. Una sesión local de emergencia no debe permanecer habilitada accidentalmente tras el corte.

Rollback previo al corte: `AUTHENTIK_ENABLED=0` y redeploy; se conserva la autenticación local. El cierre de sesión actual revoca la sesión del panel, no la sesión SSO de toda la organización.

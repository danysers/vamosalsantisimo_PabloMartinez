# Authentik: rollout controlado del panel

Estado: integración opcional en código, pendiente de vinculación de identidades y prueba de producción. No retirar el login local todavía.

Solo servicio privado `APP_SURFACE=panel`; nunca activar en la aplicación pública.

Variables privadas en Dokploy:

```
AUTHENTIK_ENABLED=1
AUTHENTIK_ONLY=0
AUTHENTIK_IDENTITIES=<JSON de 3 sujetos verificados: sub, username local esperado y role>
AUTHENTIK_DISCOVERY_URL=https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/.well-known/openid-configuration
AUTHENTIK_CLIENT_ID=<ID del proveedor exclusivo del panel>
AUTHENTIK_CLIENT_SECRET=<secreto del proveedor; nunca versionar>
```

Better Auth 1.7.7 usa `/api/auth/callback/authentik` y POST `/api/auth/sign-in/social` con `provider=authentik`. No usa los endpoints antiguos `/oauth2/*`. Authorization Code con PKCE, firma/JWKS obligatoria, origen HTTPS exacto. Sin altas públicas ni vinculación implícita por correo; no se modifican roles desde claims ni campos editables del cliente.

## Antes del corte

1. Verificar que la aplicación Authentik solo permite al grupo `vamosalsantisimo-sponsor` y a `danysers`. Revisar todas las vinculaciones guardadas; ANY entre esas dos.
2. Registrar los tres sujetos inmutables comprobados en la previsualización del proveedor en AUTHENTIK_IDENTITIES. La identidad administradora queda ligada al usuario local esperado con rol configuration; se preservan sus identificadores de usuario/operador e historial. La selección se hace por sub verificado, nunca por correo o nombre de usuario enviado por el navegador.
3. El callback provisiona transaccionalmente solo los sujetos fijados, después de verificar firma/nonce/issuer/audience; exige pertenencia a vamosalsantisimo-sponsor para sponsors y respeta baneos/deshabilitaciones y colisiones. Sin altas generales. No se registra el plugin de administración Better Auth cuando OIDC está activo; role=admin en la tabla histórica es solo compatibilidad con las comprobaciones operativas del panel. Las sesiones previas al primer vínculo son revocadas. No activar cuentas antes de revisar acceso a las otras aplicaciones: las aplicaciones sin reglas pueden admitir a cualquier usuario autenticado.
4. Probar inicio y cierre, rechazo de usuario no autorizado, Sponsor sin acceso a URLs/API de pagos/inscripciones/configuración y danysers con acceso completo.
5. Solo tras esa comprobación retirar el formulario y deshabilitar endpoints locales de contraseña. Ocultar el formulario no deshabilita autenticación. Una sesión local de emergencia no debe permanecer habilitada accidentalmente tras el corte.

Rollback previo al corte: `AUTHENTIK_ENABLED=0` y redeploy; se conserva la autenticación local. El cierre de sesión actual revoca la sesión del panel, no la sesión SSO de toda la organización.

Migración inicial: AUTHENTIK_LINK_SINGLE_ADMIN=1 permite vincular el sub administrador fijado a la única cuenta local activa con rol configuration y auth_role admin si el nombre heredado difiere. Rechaza cero o varias candidatas, cuentas bloqueadas y colisiones. Retirar esta opción después de comprobar el primer vínculo. No cambia roles ni crea otro administrador.

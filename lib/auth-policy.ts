import { admin, username } from 'better-auth/plugins'

export function localAuthPolicy(base: string, secret: string) {
  if (secret.length < 32) throw new Error('Local admin secret is missing')
  const url = new URL(base)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Admin requires HTTPS or local loopback')
  }
  return {
    baseURL: url.origin,
    trustedOrigins: [url.origin],
    secret,
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 14 },
    disabledPaths: ['/is-username-available'],
    plugins: [username({ displayUsername: false, immutableUsername: true }), admin({ defaultRole: 'user' })],
    session: { expiresIn: 8 * 60 * 60, updateAge: 15 * 60 },
    rateLimit: {
      enabled: true,
      storage: 'database' as const,
      window: 60,
      max: 30,
      customRules: { '/sign-in/username': { window: 60, max: 5 } },
    },
    advanced: { disableCSRFCheck: false, disableOriginCheck: false, trustedProxyHeaders: false, useSecureCookies: url.protocol === 'https:' },
  }
}

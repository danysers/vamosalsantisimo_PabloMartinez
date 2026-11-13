/** Server-only configuration: never expose the client secret in a client component. */
export function authentikConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.AUTHENTIK_ENABLED !== '1') return null
  const discoveryUrl = env.AUTHENTIK_DISCOVERY_URL
  const clientId = env.AUTHENTIK_CLIENT_ID
  const clientSecret = env.AUTHENTIK_CLIENT_SECRET
  if (!discoveryUrl || !clientId || !clientSecret) throw new Error('Authentik configuration is incomplete')
  const url = new URL(discoveryUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.hostname !== 'aute.codss.com.ar' || url.port ||
      url.pathname !== '/application/o/vamosalsantisimo-panel/.well-known/openid-configuration') {
    throw new Error('Invalid Authentik discovery URL')
  }
  return { providerId: 'authentik', name: 'Authentik', discoveryUrl, clientId, clientSecret,
    scopes: ['openid', 'profile', 'email'], pkce: true, requireIdTokenVerification: true,
    disableSignUp: true, overrideUserInfo: false, disableProviderLogout: true }
}

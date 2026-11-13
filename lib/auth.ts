import 'server-only'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { getDb } from './db'
import { localAuthPolicy } from './auth-policy'
import * as authSchema from './auth-schema'
import { genericOAuth } from 'better-auth/plugins'
import { authentikConfig } from './authentik-config'
import { provisionAuthentikIdentity } from './authentik-provision'

const base = process.env.BETTER_AUTH_URL
const secret = process.env.BETTER_AUTH_SECRET
if (!base || !secret || !process.env.DATABASE_URL) throw new Error('Local admin is not configured')

const policy = localAuthPolicy(base, secret)
const oidc = authentikConfig()
export const auth = betterAuth({
  ...policy,
  // Operational authorization is our own DB policy, not Better Auth administration.
  // Do not register its admin endpoints when SSO operators have schema role='admin'.
  plugins: [...policy.plugins.filter(plugin => !oidc || plugin.id !== 'admin'),
    ...(oidc ? [genericOAuth({ config: [{ ...oidc, mapProfileToUser: provisionAuthentikIdentity }] })] : [])],
  // Preserve existing operator/audit identities. Never merge accounts by email automatically.
  account: { accountLinking: { enabled: true, disableImplicitLinking: true } },
  database: drizzleAdapter(getDb(), { provider: 'pg', schema: authSchema }),
})

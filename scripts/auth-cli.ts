// Used only for generating Better Auth's Drizzle schema without importing
// Next.js's server-only sentinel. Runtime configuration lives in lib/auth.ts.
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { localAuthPolicy } from '../lib/auth-policy'
import * as authSchema from '../lib/auth-schema'

const base = process.env.BETTER_AUTH_URL
const secret = process.env.BETTER_AUTH_SECRET
const databaseUrl = process.env.DATABASE_URL
if (!base || !secret || !databaseUrl) throw new Error('Local schema generation requires temporary config')

export const auth = betterAuth({
  ...localAuthPolicy(base, secret),
  database: drizzleAdapter(drizzle(new Pool({ connectionString: databaseUrl })), { provider: 'pg', schema: authSchema }),
})

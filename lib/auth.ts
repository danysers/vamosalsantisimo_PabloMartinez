import 'server-only'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { getDb } from './db'
import { localAuthPolicy } from './auth-policy'
import * as authSchema from './auth-schema'

const base = process.env.BETTER_AUTH_URL
const secret = process.env.BETTER_AUTH_SECRET
if (!base || !secret || !process.env.DATABASE_URL) throw new Error('Local admin is not configured')

export const auth = betterAuth({
  ...localAuthPolicy(base, secret),
  database: drizzleAdapter(getDb(), { provider: 'pg', schema: authSchema }),
})

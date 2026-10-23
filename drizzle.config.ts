import { defineConfig } from 'drizzle-kit'

// Generate SQL without connecting; applying migrations requires an explicit
// private DATABASE_URL. There is no fallback to the legacy MySQL database.
export default defineConfig({
  schema: ['./lib/schema.ts', './lib/auth-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://invalid:invalid@localhost/invalid' },
})

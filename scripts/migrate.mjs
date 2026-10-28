import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  // One migrator at a time when a rolling deployment starts multiple tasks.
  await pool.query('SELECT pg_advisory_lock(2026, 1219)')
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  console.log('PostgreSQL migrations applied')
} finally {
  await pool.query('SELECT pg_advisory_unlock(2026, 1219)').catch(() => {})
  await pool.end()
}

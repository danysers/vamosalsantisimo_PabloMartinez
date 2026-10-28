import { readMigrationFiles } from 'drizzle-orm/migrator'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  // One migrator at a time. Each migration commits separately because PostgreSQL
  // cannot use an enum value added in an earlier migration until that commit.
  await client.query('SELECT pg_advisory_lock(2026, 1219)')
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
  await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)')
  const latest = await client.query('SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1')
  let lastApplied = latest.rows[0]?.created_at == null ? -1 : Number(latest.rows[0].created_at)
  for (const migration of readMigrationFiles({ migrationsFolder: './drizzle' })) {
    if (migration.folderMillis <= lastApplied) continue
    await client.query('BEGIN')
    try {
      for (const statement of migration.sql) if (statement.trim()) await client.query(statement)
      await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1,$2)', [migration.hash, migration.folderMillis])
      await client.query('COMMIT')
      lastApplied = migration.folderMillis
    } catch (error) { await client.query('ROLLBACK'); throw error }
  }
  console.log('PostgreSQL migrations applied')
} finally {
  await client.query('SELECT pg_advisory_unlock(2026, 1219)').catch(() => {})
  await client.end()
}

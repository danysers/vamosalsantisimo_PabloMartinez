import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

let pool: Pool | undefined
export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('Database is not configured')
  pool ??= new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 })
  return drizzle(pool)
}

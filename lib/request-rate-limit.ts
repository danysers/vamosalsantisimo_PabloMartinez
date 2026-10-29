import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from './db'

// Fixed, shared buckets cannot be reset with a forged IP, token or reference.
// PostgreSQL makes the decision atomic across processes and deployments.
const policies = {
  'proof-upload': 30,
  'payment-method': 60,
  'payment-status': 3000,
} as const

export async function allowPublicOperation(operation: keyof typeof policies): Promise<boolean> {
  const maximum = policies[operation]
  const result = await getDb().execute(sql`
    INSERT INTO rate_limits (key, count, window_end)
    VALUES (${`public-operation:${operation}`}, 1, now() + interval '1 minute')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_end <= now() THEN 1
        ELSE LEAST(rate_limits.count + 1, ${maximum + 1}) END,
      window_end = CASE WHEN rate_limits.window_end <= now() THEN now() + interval '1 minute'
        ELSE rate_limits.window_end END
    RETURNING count
  `)
  return Number(result.rows[0]?.count) <= maximum
}

export function tooManyRequests() {
  return Response.json({ error: 'Demasiadas solicitudes. Esperá un minuto e intentá nuevamente.' }, {
    status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'private, no-store' },
  })
}

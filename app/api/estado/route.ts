import { createHash, randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '../../../lib/db'
import { readSmallJson } from '../../../lib/read-small-json'
import { limitRegistrationRequest } from '../../../lib/registration-service'
import { registrations, reservations } from '../../../lib/schema'

export const runtime = 'nodejs'

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return reply({ error: 'Servicio no disponible.' }, 503)
  const correlation = randomUUID()
  try {
    if (!await limitRegistrationRequest(request.headers.get('x-real-ip'))) return reply({ error: 'Demasiadas solicitudes.' }, 429)
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
    let body: unknown
    try { body = await readSmallJson(request, 256) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
    const parsed = z.object({ accessToken: z.string().regex(/^[0-9a-f]{64}$/) }).strict().safeParse(body)
    if (!parsed.success) return reply({ error: 'Solicitud inválida.' }, 400)
    const hash = createHash('sha256').update(parsed.data.accessToken).digest('hex')
    const db = getDb()
    const [record] = await db.select({ id: registrations.id, reference: registrations.reference, status: registrations.status })
      .from(registrations).where(eq(registrations.accessTokenHash, hash)).limit(1)
    if (!record) return reply({ error: 'No encontramos esa inscripción.' }, 404)
    const [hold] = await db.select({ status: reservations.status, expiresAt: reservations.expiresAt })
      .from(reservations).where(eq(reservations.registrationId, record.id))
      .orderBy(desc(reservations.createdAt)).limit(1)
    const status = record.status === 'pending' && hold && (hold.status === 'expired' || (hold.status === 'held' && hold.expiresAt <= new Date()))
      ? 'expired' : record.status
    return reply({ reference: record.reference, status }, 200)
  } catch {
    console.error(`registration_status_unavailable correlation=${correlation}`)
    return reply({ error: 'Servicio temporalmente no disponible.', correlation }, 503)
  }
}

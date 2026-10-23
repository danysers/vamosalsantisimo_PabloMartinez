import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { limitRegistrationRequest, register } from '../../../lib/registration-service'
import { readSmallJson } from '../../../lib/read-small-json'

export const runtime = 'nodejs'

const payload = z.object({
  name: z.string().trim().min(3).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^[\d\s+()-]{10,25}$/),
  accessToken: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL || !process.env.WORKSHOP_EVENT_SLUG) {
    return reply({ error: 'Las inscripciones todavía no están habilitadas.' }, 503)
  }
  const correlation = randomUUID()
  try {
    const allowed = await limitRegistrationRequest(request.headers.get('x-real-ip'))
    if (!allowed) return reply({ error: 'Demasiadas solicitudes. Intentá más tarde.' }, 429)
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
    // Zod 4 narrows UUID versions; keep the canonical hexadecimal shape accepted by the previous API.
    const idempotency = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i).safeParse(request.headers.get('idempotency-key'))
    if (!idempotency.success) return reply({ error: 'Solicitud inválida.' }, 400)
    let data: unknown
    try { data = await readSmallJson(request) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
    const parsed = payload.safeParse(data)
    if (!parsed.success) return reply({ error: 'Solicitud inválida.' }, 400)
    const result = await register({ ...parsed.data, creationKey: idempotency.data })
    return reply(result.body, result.code)
  } catch {
    // Never log full names, tokens, DB URLs, SQL params, or checkout details.
    console.error(`registration_unavailable correlation=${correlation}`)
    return reply({ error: 'Servicio temporalmente no disponible.', correlation }, 503)
  }
}

export async function GET() {
  return reply({ error: 'No disponible.' }, 404)
}

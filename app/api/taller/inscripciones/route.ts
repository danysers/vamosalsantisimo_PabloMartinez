import { publicRequestOrigin } from '../../../../lib/public-site-origin'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { limitRegistrationRequest } from '../../../../lib/registration-service'
import { readSmallJson } from '../../../../lib/read-small-json'
import { enrollWorkshop } from '../../../../lib/workshop-enrollment'
import { individualRegistrationSchema } from '../../../../lib/workshop-input'
import { localWorkshopTestMode } from '../../../../lib/checkout-access'

export const runtime = 'nodejs'

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  // The mail worker is a separate process: operators must verify SMTP delivery
  // before explicitly enabling public registrations. Never acknowledge receipt
  // while knowingly unable to send the promised confirmation.
  const localTest = localWorkshopTestMode(request.nextUrl.origin)
  if (!process.env.DATABASE_URL || !process.env.WORKSHOP_EVENT_SLUG || (process.env.REGISTRATION_EMAIL_READY !== '1' && !localTest)) {
    return reply({ error: 'Las inscripciones todavía no están habilitadas.' }, 503)
  }
  if (!publicRequestOrigin(request)) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  const idempotency = z.uuid().safeParse(request.headers.get('idempotency-key'))
  if (!idempotency.success) return reply({ error: 'Solicitud inválida.' }, 400)
  try {
    if (!await limitRegistrationRequest(request.headers.get('x-real-ip'))) return reply({ error: 'Demasiadas solicitudes. Intentá más tarde.' }, 429)
    let data: unknown
    try { data = await readSmallJson(request) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
    const parsed = individualRegistrationSchema.safeParse(data)
    if (!parsed.success) return reply({ error: 'Revisá los datos del formulario y volvé a intentar.' }, 400)
    const result = await enrollWorkshop({ ...parsed.data, creationKey: idempotency.data })
    return reply({ ...result.body, ...(localTest && result.code < 300 ? { localTest: true } : {}),
      ...(result.code < 300 && process.env.MP_ENVIRONMENT === 'test' ? { testMode: true } : {}) }, result.code)
  } catch {
    // Never log contact details, request body, account credentials or email contents.
    const correlation = randomUUID()
    console.error(`workshop_enrollment_unavailable correlation=${correlation}`)
    return reply({ error: 'Servicio temporalmente no disponible.', correlation }, 503)
  }
}

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { limitRegistrationRequest } from '../../../../lib/registration-service'
import { readSmallJson } from '../../../../lib/read-small-json'
import { enrollWorkshop } from '../../../../lib/workshop-enrollment'

export const runtime = 'nodejs'

const personName = z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u)
const optionalText = (limit: number) => z.string().trim().max(limit).optional()
const payload = z.object({
  firstName: personName,
  lastName: personName,
  birthDate: z.iso.date().refine(value => {
    const date = new Date(`${value}T12:00:00Z`)
    return value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10) &&
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
  phone: z.string().trim().min(7).max(25).regex(/^\+?[\d\s()-]+$/).refine(value => {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 7 && digits.length <= 15 && !/^(\d)\1+$/.test(digits)
  }),
  email: z.email().max(160),
  prayerGroup: optionalText(160),
  movement: optionalText(160),
  ecclesialState: z.enum(['laico', 'religioso', 'seminarista', 'diacono', 'postulante-novicia', 'presbitero', 'otro']),
  occupation: optionalText(160),
  paymentDifficulty: z.boolean(),
  paymentDifficultyNotes: optionalText(1000),
  paymentMethod: z.enum(['bank_transfer', 'on_site']).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.paymentDifficulty === !!value.paymentMethod) ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Elegí una forma de pago válida.' })
  if (!value.paymentDifficulty && value.paymentDifficultyNotes?.trim()) ctx.addIssue({ code: 'custom', path: ['paymentDifficultyNotes'], message: 'No corresponde.' })
})

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  // The mail worker is a separate process: operators must verify SMTP delivery
  // before explicitly enabling public registrations. Never acknowledge receipt
  // while knowingly unable to send the promised confirmation.
  if (!process.env.DATABASE_URL || !process.env.WORKSHOP_EVENT_SLUG || process.env.REGISTRATION_EMAIL_READY !== '1') {
    return reply({ error: 'Las inscripciones todavía no están habilitadas.' }, 503)
  }
  const origin = request.headers.get('origin')
  const expected = process.env.SITE_ORIGIN ?? request.nextUrl.origin
  if (!origin || origin !== expected) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  const idempotency = z.uuid().safeParse(request.headers.get('idempotency-key'))
  if (!idempotency.success) return reply({ error: 'Solicitud inválida.' }, 400)
  try {
    if (!await limitRegistrationRequest(request.headers.get('x-real-ip'))) return reply({ error: 'Demasiadas solicitudes. Intentá más tarde.' }, 429)
    let data: unknown
    try { data = await readSmallJson(request) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
    const parsed = payload.safeParse(data)
    if (!parsed.success) return reply({ error: 'Revisá los datos del formulario y volvé a intentar.' }, 400)
    const result = await enrollWorkshop({ ...parsed.data, creationKey: idempotency.data })
    return reply(result.body, result.code)
  } catch {
    // Never log contact details, request body, account credentials or email contents.
    const correlation = randomUUID()
    console.error(`workshop_enrollment_unavailable correlation=${correlation}`)
    return reply({ error: 'Servicio temporalmente no disponible.', correlation }, 503)
  }
}

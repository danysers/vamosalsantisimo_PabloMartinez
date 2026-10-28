import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { user as authUser } from '../../../../../lib/auth-schema'
import { getDb } from '../../../../../lib/db'
import { reviewAssistance } from '../../../../../lib/assistance-review'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { adminUsers } from '../../../../../lib/schema'

export const runtime = 'nodejs'

const payload = z.object({
  registrationId: z.uuid(),
  decision: z.enum(['approved', 'declined']),
  note: z.string().trim().max(1000).default(''),
}).strict().superRefine((value, ctx) => {
  if (value.decision === 'declined' && value.note.length < 5) {
    ctx.addIssue({ code: 'custom', path: ['note'], message: 'Indicá un motivo breve para rechazar.' })
  }
})

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
}

export async function POST(request: NextRequest) {
  if (process.env.APP_SURFACE !== 'panel') return reply({ error: 'No disponible.' }, 404)
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_URL || !process.env.BETTER_AUTH_SECRET || !process.env.WORKSHOP_EVENT_SLUG) {
    return reply({ error: 'Administración no configurada.' }, 503)
  }
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(process.env.BETTER_AUTH_URL).origin) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  let data: unknown
  try { data = await readSmallJson(request) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
  const parsed = payload.safeParse(data)
  if (!parsed.success) return reply({ error: 'Revisá la decisión y el motivo.' }, 400)

  try {
    const { auth } = await import('../../../../../lib/auth')
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return reply({ error: 'Iniciá sesión para continuar.' }, 401)
    const db = getDb()
    const [operator] = await db.select({ id: adminUsers.id, role: adminUsers.role, disabled: adminUsers.disabled,
      authRole: authUser.role, banned: authUser.banned })
      .from(adminUsers).innerJoin(authUser, eq(adminUsers.authUserId, authUser.id))
      .where(eq(authUser.id, session.user.id)).limit(1)
    if (!operator || operator.disabled || operator.banned || operator.authRole !== 'admin' ||
      !['configuration', 'registration_operator'].includes(operator.role)) return reply({ error: 'Acceso no autorizado.' }, 403)

    const result = await reviewAssistance(db, {
      registrationId: parsed.data.registrationId,
      eventSlug: process.env.WORKSHOP_EVENT_SLUG,
      operatorId: operator.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
    })
    return reply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`assistance_review_unavailable correlation=${correlation}`)
    return reply({ error: 'Administración temporalmente no disponible.', correlation }, 503)
  }
}

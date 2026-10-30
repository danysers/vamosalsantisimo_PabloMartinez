import 'server-only'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { user as authUser } from './auth-schema'
import { getDb } from './db'
import { adminUsers } from './schema'

export type OperatorRole = 'configuration' | 'registration_operator' | 'admission_operator'

export function privateReply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
}

export async function authorizeOperator(request: NextRequest, roles: OperatorRole[], requireOrigin = true): Promise<
  { operatorId: string; eventSlug: string; role: OperatorRole } | { response: NextResponse }
> {
  if (process.env.APP_SURFACE !== 'panel') return { response: privateReply({ error: 'No disponible.' }, 404) }
  const base = process.env.BETTER_AUTH_URL
  const eventSlug = process.env.WORKSHOP_EVENT_SLUG
  if (!process.env.DATABASE_URL || !base || !process.env.BETTER_AUTH_SECRET || !eventSlug) {
    return { response: privateReply({ error: 'Administración no configurada.' }, 503) }
  }
  let expectedOrigin: string
  try { expectedOrigin = new URL(base).origin } catch { return { response: privateReply({ error: 'Administración no configurada.' }, 503) } }
  if (requireOrigin && request.headers.get('origin') !== expectedOrigin) {
    return { response: privateReply({ error: 'Solicitud inválida.' }, 403) }
  }
  const { auth } = await import('./auth')
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return { response: privateReply({ error: 'Iniciá sesión para continuar.' }, 401) }
  const db = getDb()
  const [operator] = await db.select({ id: adminUsers.id, role: adminUsers.role, disabled: adminUsers.disabled,
    authRole: authUser.role, banned: authUser.banned }).from(adminUsers)
    .innerJoin(authUser, eq(adminUsers.authUserId, authUser.id))
    .where(eq(authUser.id, session.user.id)).limit(1)
  if (!operator || operator.disabled || operator.banned || operator.authRole !== 'admin' || !roles.includes(operator.role)) {
    return { response: privateReply({ error: 'Acceso no autorizado.' }, 403) }
  }
  return { operatorId: operator.id, eventSlug, role: operator.role }
}

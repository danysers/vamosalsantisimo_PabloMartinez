import { readSmallJson } from '../../../../lib/read-small-json'
import { authentikAuthorizationURL, authentikLogoutURL, signedOutCookieName } from '../../../../lib/authentik-config'
import { randomUUID } from 'node:crypto'
import { toNextJsHandler } from 'better-auth/next-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const loggedActions = new Set(['/sign-in/username', '/sign-in/email', '/sign-out', '/sign-up/email', '/sign-up/username'])

function auditAction(request: NextRequest, status: number, correlationId: string) {
  const path = request.nextUrl.pathname.slice('/api/auth'.length)
  const action = path.startsWith('/admin/') ? '/admin/*' : path
  if (request.method === 'POST' && (loggedActions.has(action) || action === '/admin/*')) {
    // Never log the body, email, username, cookie, token or IP address.
    console.info(JSON.stringify({ event: 'admin_auth_action', action, status, correlationId }))
  }
}

function panelAuthReady(): boolean {
  if (process.env.APP_SURFACE !== 'panel') return false
  const base = process.env.BETTER_AUTH_URL
  if (!base || !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) return false
  try {
    const expected = new URL(base)
    return expected.protocol === 'https:' ||
      (expected.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(expected.hostname))
  } catch { return false }
}

async function handle(request: NextRequest, method: 'GET' | 'POST'): Promise<Response> {
  const correlationId = randomUUID()
  if (process.env.APP_SURFACE !== 'panel') return new NextResponse('No disponible.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const authPath = request.nextUrl.pathname.slice('/api/auth'.length)
  // Better Auth's admin plugin is schema compatibility only, never an exposed management API.
  if (authPath.startsWith('/admin/') || (process.env.AUTHENTIK_ONLY === '1' &&
      !['/authentik-start', '/authentik-logout', '/sign-in/social', '/callback/authentik', '/sign-out', '/get-session', '/error'].includes(authPath))) {
    return NextResponse.json({ error: 'No disponible.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!panelAuthReady()) {
    auditAction(request, 503, correlationId)
    return NextResponse.json({ error: 'Administración local no configurada.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'X-Correlation-ID': correlationId },
    })
  }
  try {
    if (method === 'POST' && authPath === '/authentik-logout') {
      const baseURL = new URL(process.env.BETTER_AUTH_URL!)
      if (request.headers.get('origin') !== baseURL.origin) {
        return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
      }
      const logoutErrorRedirect = (response?: Response) => {
        const redirectResponse = NextResponse.redirect(new URL('/admin?authError=logout', baseURL), 303)
        for (const cookie of response?.headers.getSetCookie() ?? []) redirectResponse.headers.append('Set-Cookie', cookie)
        redirectResponse.headers.set('Cache-Control', 'no-store')
        return redirectResponse
      }
      const { auth } = await import('../../../../lib/auth')
      const signOutRequest = new Request(new URL('/api/auth/sign-out', baseURL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseURL.origin,
          ...(request.headers.get('cookie') ? { Cookie: request.headers.get('cookie')! } : {}) },
        body: JSON.stringify({ callbackURL: '/admin' }),
      })
      const signOutResponse = await auth.handler(signOutRequest)
      if (!signOutResponse.ok) return logoutErrorRedirect(signOutResponse)
      const payload = await signOutResponse.json() as { url?: unknown }
      const destination = authentikLogoutURL(payload.url)
      if (!destination) return logoutErrorRedirect(signOutResponse)
      const redirectResponse = NextResponse.redirect(destination, 303)
      for (const cookie of signOutResponse.headers.getSetCookie()) redirectResponse.headers.append('Set-Cookie', cookie)
      // Authentik is allowed to return only to /admin. Keep a brief first-party
      // marker so that route shows a signed-out page instead of auto-login.
      redirectResponse.cookies.set(signedOutCookieName, '1', { httpOnly: true, secure: true,
        sameSite: 'lax', path: '/admin', maxAge: 300 })
      redirectResponse.headers.set('Cache-Control', 'no-store')
      redirectResponse.headers.set('X-Correlation-ID', correlationId)
      return redirectResponse
    }
    if (method === 'GET' && authPath === '/authentik-start') {
      if (process.env.AUTHENTIK_ONLY !== '1' || process.env.AUTHENTIK_ENABLED !== '1') {
        return new NextResponse('No disponible.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
      }
      const baseURL = new URL(process.env.BETTER_AUTH_URL!)
      const authErrorRedirect = () => {
        const response = NextResponse.redirect(new URL('/admin?authError=1', baseURL), 303)
        response.headers.set('Cache-Control', 'no-store')
        return response
      }
      const { auth } = await import('../../../../lib/auth')
      const signInRequest = new Request(new URL('/api/auth/sign-in/social', baseURL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseURL.origin },
        body: JSON.stringify({ provider: 'authentik', callbackURL: '/admin', errorCallbackURL: '/admin?authError=1' }),
      })
      const signInResponse = await auth.handler(signInRequest)
      if (!signInResponse.ok) return authErrorRedirect()
      const payload = await signInResponse.json() as { url?: unknown }
      const destination = authentikAuthorizationURL(payload.url)
      if (!destination) return authErrorRedirect()
      const redirectResponse = NextResponse.redirect(destination, 302)
      for (const cookie of signInResponse.headers.getSetCookie()) redirectResponse.headers.append('Set-Cookie', cookie)
      redirectResponse.cookies.set(signedOutCookieName, '', { httpOnly: true, secure: true,
        sameSite: 'lax', path: '/admin', maxAge: 0 })
      redirectResponse.headers.set('Cache-Control', 'no-store')
      redirectResponse.headers.set('X-Correlation-ID', correlationId)
      return redirectResponse
    }
    if (method === 'POST') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 415 })
      let body: unknown
      try { body = await readSmallJson(request, 16 * 1024) }
      catch { return NextResponse.json({ error: 'Solicitud inválida o demasiado grande.' }, { status: 400 }) }
      request = new NextRequest(request.url, { method, headers: request.headers, body: JSON.stringify(body) })
    }
    const { auth } = await import('../../../../lib/auth')
    const handler = toNextJsHandler(auth)
    const response = await handler[method](request)
    if (response.status === 429) response.headers.set('Retry-After', response.headers.get('X-Retry-After') || '60')
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Correlation-ID', correlationId)
    auditAction(request, response.status, correlationId)
    return response
  } catch {
    console.error(JSON.stringify({ event: 'admin_auth_error', kind: 'handler_unavailable', correlationId }))
    auditAction(request, 503, correlationId)
    if (method === 'GET' && authPath === '/authentik-start') {
      const response = NextResponse.redirect(new URL('/admin?authError=1', process.env.BETTER_AUTH_URL!), 303)
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    if (method === 'POST' && authPath === '/authentik-logout') {
      const response = NextResponse.redirect(new URL('/admin?authError=logout', process.env.BETTER_AUTH_URL!), 303)
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    return NextResponse.json({ error: 'Servicio temporalmente no disponible.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'X-Correlation-ID': correlationId },
    })
  }
}

export async function GET(request: NextRequest) { return handle(request, 'GET') }
export async function POST(request: NextRequest) { return handle(request, 'POST') }

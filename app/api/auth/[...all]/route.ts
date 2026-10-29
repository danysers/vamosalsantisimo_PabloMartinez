import { readSmallJson } from '../../../../lib/read-small-json'
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
  if (!panelAuthReady()) {
    auditAction(request, 503, correlationId)
    return NextResponse.json({ error: 'Administración local no configurada.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'X-Correlation-ID': correlationId },
    })
  }
  try {
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
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Correlation-ID', correlationId)
    auditAction(request, response.status, correlationId)
    return response
  } catch {
    console.error(JSON.stringify({ event: 'admin_auth_error', kind: 'handler_unavailable', correlationId }))
    auditAction(request, 503, correlationId)
    return NextResponse.json({ error: 'Servicio temporalmente no disponible.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'X-Correlation-ID': correlationId },
    })
  }
}

export async function GET(request: NextRequest) { return handle(request, 'GET') }
export async function POST(request: NextRequest) { return handle(request, 'POST') }

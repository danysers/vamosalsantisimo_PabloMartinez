import { randomBytes } from 'node:crypto'
import { contentPolicy } from './lib/browser-security.mjs'
import { createMemoryGate, isTrafficEntry, trafficWaitHeaders, trafficWaitHtml } from './lib/traffic-guard.mjs'
import { NextRequest, NextResponse } from 'next/server'

const administrativePath = /^\/(?:admin|api\/(?:admin|auth))(?:\/|$)/
const panelAsset = /^\/(?:_next(?:\/|$)|robots\.txt$|favicon-mark\.png$|page-transition\.js$|operational-errors\.js$|404\/vamos-al-santisimo-20261030\.webp$)/
const panelPublicSponsor = /^\/api\/public\/sponsors(?:\/|$)/
const memoryGate = createMemoryGate()

function hidden() {
  return new NextResponse('No disponible.', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}

function nextPage(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path.startsWith('/api/') || path.startsWith('/_next/') || path.includes('.') ||
      path === '/' || path.startsWith('/formacion') || path.startsWith('/pagina') || path.startsWith('/eventos-anteriores')) return NextResponse.next()
  const nonce = randomBytes(24).toString('base64')
  const policy = contentPolicy("'nonce-" + nonce + "'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
    process.env.APP_SURFACE !== 'panel' && ['/donaciones', '/voluntarios', '/sumar-marca'].includes(path))
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', policy)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Cloudflare declares the external scheme even when the tunnel uses HTTP.
  // Do not infer it from the internal connection, which would create HTTPS loops.
  const publicHost = request.headers.get('host')?.toLowerCase()
  if (['GET', 'HEAD'].includes(request.method) &&
      ['vamosalsantisimo.com', 'www.vamosalsantisimo.com', 'pablomartinez.vamosalsantisimo.com'].includes(publicHost || '')) {
    try {
      if (JSON.parse(request.headers.get('cf-visitor') || '{}').scheme === 'http') {
        const target = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://' + publicHost)
        return NextResponse.redirect(target, 308)
      }
    } catch { /* Malformed optional proxy metadata never changes routing or auth. */ }
  }
  if (process.env.APP_SURFACE === 'panel') {
    if (path === '/') return NextResponse.redirect(new URL('/admin', request.url))
    return administrativePath.test(path) || panelAsset.test(path) || panelPublicSponsor.test(path) ? nextPage(request) : hidden()
  }
  // An unset/unknown surface is public, never administrative.
  if (administrativePath.test(path)) return hidden()
  if (process.env.TRAFFIC_GUARD_ENABLED === '1' && isTrafficEntry(request.method, path)) {
    if (memoryGate().waiting) return new NextResponse(request.method === 'HEAD' ? null : trafficWaitHtml, {
      status: 503, headers: trafficWaitHeaders,
    })
    const response = nextPage(request)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  return nextPage(request)
}

export const config = { matcher: '/:path*' }

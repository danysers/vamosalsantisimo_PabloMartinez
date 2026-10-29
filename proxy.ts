import { randomBytes } from 'node:crypto'
import { contentPolicy } from './lib/browser-security.mjs'
import { NextRequest, NextResponse } from 'next/server'

const administrativePath = /^\/(?:admin|api\/(?:admin|auth))(?:\/|$)/
const panelAsset = /^\/(?:_next(?:\/|$)|favicon-mark\.png$|page-transition\.js$)/

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
  const policy = contentPolicy("'nonce-" + nonce + "'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''))
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
  if (process.env.APP_SURFACE === 'panel') {
    if (path === '/') return NextResponse.redirect(new URL('/admin', request.url))
    return administrativePath.test(path) || panelAsset.test(path) ? nextPage(request) : hidden()
  }
  // An unset/unknown surface is public, never administrative.
  return administrativePath.test(path) ? hidden() : nextPage(request)
}

export const config = { matcher: '/:path*' }

import { NextRequest, NextResponse } from 'next/server'

const administrativePath = /^\/(?:admin|api\/(?:admin|auth))(?:\/|$)/
const panelAsset = /^\/(?:_next(?:\/|$)|favicon-mark\.png$|page-transition\.js$)/

function hidden() {
  return new NextResponse('No disponible.', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (process.env.APP_SURFACE === 'panel') {
    if (path === '/') return NextResponse.redirect(new URL('/admin', request.url))
    return administrativePath.test(path) || panelAsset.test(path) ? NextResponse.next() : hidden()
  }
  // An unset/unknown surface is public, never administrative.
  return administrativePath.test(path) ? hidden() : NextResponse.next()
}

export const config = { matcher: '/:path*' }

type PublicRequest = { headers: Headers; nextUrl: { origin: string } }

function exactOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) return null
    return url.origin
  } catch { return null }
}

export function publicSiteOrigins() {
  return [process.env.SITE_ORIGIN, ...(process.env.PUBLIC_SITE_ALIASES || '').split(',')]
    .filter((value): value is string => !!value?.trim()).map(value => exactOrigin(value.trim()))
    .filter((value): value is string => value !== null)
}

// Each public domain is explicitly configured; never trust an arbitrary Host,
// forwarded header, wildcard subdomain or browser-provided redirect URL.
export function publicRequestOrigin(request: PublicRequest): string | null {
  const origin = request.headers.get('origin')
  if (!origin || exactOrigin(origin) !== origin) return null
  const configured = publicSiteOrigins()
  if (!process.env.SITE_ORIGIN) {
    const local = exactOrigin(request.nextUrl.origin)
    if (local && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(local)) configured.push(local)
  }
  return configured.includes(origin) ? origin : null
}

export function workshopCheckoutReturnUrl(reference: string, requestOrigin?: string, returnToken?: string) {
  if (requestOrigin && !publicSiteOrigins().includes(requestOrigin)) throw new Error('Untrusted checkout return origin')
  const origin = requestOrigin || process.env.MP_PUBLIC_ORIGIN || process.env.SITE_ORIGIN
  const trusted = origin ? exactOrigin(origin) : null
  if (!trusted?.startsWith('https:')) return undefined
  const url = new URL('/formacion/pago', trusted)
  url.searchParams.set('reference', reference)
  // Fragments are not sent to our HTTP server or in Referer headers. The client
  // removes this short-lived capability before calling the exchange endpoint.
  if (returnToken) url.hash = new URLSearchParams({ return: returnToken }).toString()
  return url.toString()
}

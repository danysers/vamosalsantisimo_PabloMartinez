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

export function workshopCheckoutReturnUrl(reference: string, requestOrigin?: string) {
  if (requestOrigin && !publicSiteOrigins().includes(requestOrigin)) throw new Error('Untrusted checkout return origin')
  const origin = requestOrigin || process.env.MP_PUBLIC_ORIGIN || process.env.SITE_ORIGIN
  const trusted = origin ? exactOrigin(origin) : null
  return trusted?.startsWith('https:')
    ? `${trusted}/formacion/pago?reference=${encodeURIComponent(reference)}` : undefined
}

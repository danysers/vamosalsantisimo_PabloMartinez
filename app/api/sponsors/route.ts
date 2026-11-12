const panelOrigin = 'https://paneltaller2026.vamosalsantisimo.com'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.APP_SURFACE === 'panel') return new Response('Not found', { status: 404 })
  try {
    const response = await fetch(`${panelOrigin}/api/public/sponsors`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error('Sponsor panel unavailable')
    const data = await response.json()
    if (!data || data.available !== true || !Array.isArray(data.sponsors) || data.sponsors.length > 80) throw new Error('Invalid sponsor feed')
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ available: false, sponsors: [] }, { headers: { 'Cache-Control': 'no-store' } }) }
}

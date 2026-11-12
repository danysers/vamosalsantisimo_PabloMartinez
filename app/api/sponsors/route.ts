const panelOrigin = 'https://paneltaller2026.vamosalsantisimo.com'
const legacy = [
  { id: '1DhXZC15-OFRCK3FeWS0RmaDlSo2Qw43a', name: 'José Motos', image: '/2026/sponsors/legacy-jose-motos.jpg' },
  { id: '1Uh5ORcCo6u3gF_MAUfvgyTpQZXIaP0am', name: 'logos sponsors 2025', image: '/2026/sponsors/legacy-sponsors-2025.png' },
]
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.APP_SURFACE === 'panel') return new Response('Not found', { status: 404 })
  try {
    const response = await fetch(`${panelOrigin}/api/public/sponsors`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error('Sponsor panel unavailable')
    const data = await response.json()
    if (!data || data.available !== true || !Array.isArray(data.sponsors) || data.sponsors.length > 80) throw new Error('Invalid sponsor feed')
    const names = new Set(data.sponsors.map((sponsor: { name: string }) => key(sponsor.name)))
    return Response.json({ ...data, sponsors: [...data.sponsors, ...legacy.filter(item => !names.has(key(item.name)))] },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ available: true, links: [], sponsors: legacy }, { headers: { 'Cache-Control': 'no-store' } }) }
}

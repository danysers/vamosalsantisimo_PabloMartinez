import { boundedDownload } from '../../../../../lib/bounded-download.mjs'
import { matchesImageSignature } from '../../../../../lib/sponsor-media.mjs'

const panelOrigin = 'https://paneltaller2026.vamosalsantisimo.com'
export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  if (process.env.APP_SURFACE === 'panel') return new Response('Not found', { status: 404 })
  const filename = (await params).filename
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}-[a-f0-9]{32}\.(png|jpg|webp)$/.test(filename)) return new Response('Not found', { status: 404 })
  try {
    const response = await fetch(`${panelOrigin}/api/public/sponsors/media/${filename}`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error('Logo unavailable')
    const mimeType = response.headers.get('content-type') || ''
    const bytes = await boundedDownload(response, 4 * 1024 * 1024)
    if (!matchesImageSignature(bytes, mimeType)) throw new Error('Invalid logo')
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response('Not found', { status: 404 }) }
}

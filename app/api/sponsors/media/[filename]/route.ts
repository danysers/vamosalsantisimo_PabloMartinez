import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sponsorCacheDir, validSponsorManifest } from '../../../../../lib/sponsor-media.mjs'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params
  if (!/^[A-Za-z0-9_-]{10,100}-[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(filename)) return new Response('Not found', { status: 404 })
  try {
    const manifest: unknown = JSON.parse(await readFile(join(sponsorCacheDir, 'manifest.json'), 'utf8'))
    if (!validSponsorManifest(manifest)) throw new Error('Invalid sponsor manifest')
    const file = (manifest as { files: { filename: string; mimeType: string; size: number }[] }).files.find(item => item.filename === filename)
    if (!file) return new Response('Not found', { status: 404 })
    const data = await readFile(join(sponsorCacheDir, filename))
    if (data.length !== file.size) throw new Error('Sponsor image changed')
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': file.mimeType,
      'Content-Length': String(data.length), 'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response('Not found', { status: 404 }) }
}

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { flyerCacheDir, flyerFilenamePattern, maxFlyerBytes } from '../../../../../lib/flyer-media.mjs'
import { matchesImageSignature } from '../../../../../lib/sponsor-media.mjs'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params
  if (!flyerFilenamePattern.test(filename)) return new Response('Not found', { status: 404 })
  try {
    // Older verified versions remain downloadable while an open tab refreshes.
    // This private directory contains only bounded public flyer images.
    const path = join(flyerCacheDir, filename)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > maxFlyerBytes) throw new Error('Invalid flyer size')
    const data = await readFile(path)
    const checksum = filename.match(/-([a-f0-9]{32})\.png$/)?.[1]
    if (data.length !== metadata.size || !matchesImageSignature(data, 'image/png') ||
        createHash('md5').update(data).digest('hex') !== checksum) throw new Error('Flyer image changed')
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/png', 'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response('Not found', { status: 404 }) }
}

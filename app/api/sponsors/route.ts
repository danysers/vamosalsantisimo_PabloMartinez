import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sponsorCacheDir, validSponsorManifest } from '../../../lib/sponsor-media.mjs'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const manifest: unknown = JSON.parse(await readFile(join(sponsorCacheDir, 'manifest.json'), 'utf8'))
    if (!validSponsorManifest(manifest)) throw new Error('Invalid sponsor manifest')
    const files = (manifest as { files: { id: string; name: string; filename: string }[] }).files
    return Response.json({ available: true, sponsors: files.map(file => ({ id: file.id, name: file.name,
      image: `/api/sponsors/media/${file.filename}` })) }, { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch {
    // The four established sponsors remain in static HTML if Drive is unavailable.
    return Response.json({ available: false, sponsors: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

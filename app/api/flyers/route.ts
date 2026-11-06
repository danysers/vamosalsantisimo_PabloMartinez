import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { flyerCacheDir, validFlyerManifest } from '../../../lib/flyer-media.mjs'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const manifest = JSON.parse(await readFile(join(flyerCacheDir, 'manifest.json'), 'utf8'))
    if (!validFlyerManifest(manifest)) throw new Error('Invalid flyer manifest')
    return Response.json({ available: true, version: manifest.version,
      files: manifest.files.map((file: { format: string; page: number; filename: string; name: string }) => ({
        format: file.format, page: file.page, image: `/api/flyers/media/${file.filename}`, name: file.name,
      })) }, { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch {
    return Response.json({ available: false, files: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

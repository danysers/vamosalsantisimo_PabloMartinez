import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../../../../lib/db'
import { events, workshopSponsors } from '../../../../../../lib/schema'
import { matchesImageSignature } from '../../../../../../lib/sponsor-media.mjs'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  if (process.env.APP_SURFACE !== 'panel' || !process.env.WORKSHOP_EVENT_SLUG) return new Response('Not found', { status: 404 })
  const filename = (await params).filename
  const match = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})-([a-f0-9]{32})\.(png|jpg|webp)$/.exec(filename)
  if (!match) return new Response('Not found', { status: 404 })
  try {
    const [row] = await getDb().select({ data: workshopSponsors.logoDataBase64, checksum: workshopSponsors.logoChecksum,
      mimeType: workshopSponsors.logoMimeType, size: workshopSponsors.logoSizeBytes })
      .from(workshopSponsors).innerJoin(events, eq(events.id, workshopSponsors.eventId))
      .where(and(eq(workshopSponsors.id, match[1]), eq(events.slug, process.env.WORKSHOP_EVENT_SLUG))).limit(1)
    const expectedExtension = row?.mimeType === 'image/png' ? 'png' : row?.mimeType === 'image/jpeg' ? 'jpg' : 'webp'
    if (!row || row.checksum !== match[2] || match[3] !== expectedExtension || row.size > 4 * 1024 * 1024) return new Response('Not found', { status: 404 })
    const bytes = Buffer.from(row.data, 'base64')
    if (bytes.length !== row.size || createHash('md5').update(bytes).digest('hex') !== row.checksum ||
      !matchesImageSignature(bytes, row.mimeType)) return new Response('Not found', { status: 404 })
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': row.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response('Not found', { status: 404 }) }
}

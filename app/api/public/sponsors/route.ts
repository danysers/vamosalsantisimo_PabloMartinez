import { eq } from 'drizzle-orm'
import { getDb } from '../../../../lib/db'
import { events, workshopSponsors } from '../../../../lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.APP_SURFACE !== 'panel' || !process.env.WORKSHOP_EVENT_SLUG) return new Response('Not found', { status: 404 })
  try {
    const rows = await getDb().select({ id: workshopSponsors.id, name: workshopSponsors.brandName,
      checksum: workshopSponsors.logoChecksum, mimeType: workshopSponsors.logoMimeType })
      .from(workshopSponsors).innerJoin(events, eq(events.id, workshopSponsors.eventId))
      .where(eq(events.slug, process.env.WORKSHOP_EVENT_SLUG)).limit(80)
    const sponsors = rows.map(row => ({ id: row.id, name: row.name,
      image: `/api/sponsors/media/${row.id}-${row.checksum}.${row.mimeType === 'image/png' ? 'png' : row.mimeType === 'image/jpeg' ? 'jpg' : 'webp'}` }))
    return Response.json({ available: true, links: [], sponsors }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ available: false, sponsors: [] }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}

import { createEventVenueService, weatherApiUrl } from '@/lib/event-weather'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getEventVenue = createEventVenueService(async () => {
  const response = await fetch(weatherApiUrl(), { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Weather service unavailable')
  return response.json()
})

export async function GET() {
  const result = await getEventVenue(process.env.EVENT_VENUE_OVERRIDE)
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

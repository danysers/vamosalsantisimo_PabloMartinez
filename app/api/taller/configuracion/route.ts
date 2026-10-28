import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../../lib/db'
import { events, workshops, workshopLots, workshopPaymentSettings } from '../../../../lib/schema'
import { checkoutConfigured } from '../../../../lib/mercado-pago-client'
import { localWorkshopTestMode } from '../../../../lib/checkout-access'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    if (!process.env.DATABASE_URL || !process.env.WORKSHOP_EVENT_SLUG) throw new Error('Unavailable')
    const [row] = await getDb().select({ open: workshops.registrationOpen, amountMinor: workshopLots.amountMinor,
      mp: workshopPaymentSettings.mercadoPagoEnabled, feeMinor: workshopPaymentSettings.onlineServiceFeeMinor,
      onSitePriceMinor: workshopPaymentSettings.onSitePriceMinor,
      transfer: workshopPaymentSettings.transferEnabled, onSite: workshopPaymentSettings.onSiteEnabled })
      .from(workshops).innerJoin(events, eq(events.id, workshops.eventId))
      .innerJoin(workshopLots, and(eq(workshopLots.workshopId, workshops.id), eq(workshopLots.number, workshops.activeLot)))
      .innerJoin(workshopPaymentSettings, eq(workshopPaymentSettings.workshopId, workshops.id))
      .where(eq(events.slug, process.env.WORKSHOP_EVENT_SLUG)).limit(1)
    if (!row) throw new Error('Unavailable')
    const localTest = localWorkshopTestMode(request.nextUrl.origin)
    const registrationOpen = row.open && (localTest || process.env.REGISTRATION_EMAIL_READY === '1')
    const onlineCheckoutReady = row.mp && checkoutConfigured()
    const localPaymentPreview = localTest && localWorkshopTestMode(process.env.SITE_ORIGIN ?? '')
    return Response.json({ registrationOpen, localTest, environment: process.env.MP_ENVIRONMENT === 'production' ? 'production' : 'test',
      baseAmountMinor: row.amountMinor, feeMinor: row.feeMinor, mercadoPagoTotalMinor: row.amountMinor + row.feeMinor,
      onSitePriceMinor: row.onSitePriceMinor,
      onlineCheckoutReady,
      methods: { mercado_pago: registrationOpen && (onlineCheckoutReady || localPaymentPreview), bank_transfer: registrationOpen && row.transfer, on_site: registrationOpen && row.onSite },
    }, { headers })
  } catch { return Response.json({ registrationOpen: false, error: 'Las inscripciones todavía no están habilitadas.' }, { status: 503, headers }) }
}

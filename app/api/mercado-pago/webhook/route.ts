import { NextRequest } from 'next/server'
import { parseMercadoPagoNotification } from '../../../../lib/mercado-pago-notification'
import { readSmallJson } from '../../../../lib/read-small-json'
import { verifyMercadoPagoSignature } from '../../../../lib/mercado-pago-webhook'
import { mercadoPagoConfig, assertOrderEnvironment } from '../../../../lib/mercado-pago-client'
import { persistMercadoPagoNotification } from '../../../../lib/workshop-payments'

export const runtime = 'nodejs'
const reply = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('data.id') || ''
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return reply({ error: 'No disponible.' }, 503)
  if (!verifyMercadoPagoSignature({ resourceId: orderId, requestId: request.headers.get('x-request-id'), signature: request.headers.get('x-signature'), secret })) return reply({ error: 'Firma inválida.' }, 401)
  let data: ReturnType<typeof parseMercadoPagoNotification>
  try {
    const config = mercadoPagoConfig(false)
    data = parseMercadoPagoNotification(await readSmallJson(request), { orderId,
      applicationId: config.applicationId, sellerUserId: config.sellerUserId, liveMode: config.liveMode })
    assertOrderEnvironment(data.orderId, config.liveMode)
  } catch { return reply({ error: 'Notificación inválida.' }, 400) }
  try {
    await persistMercadoPagoNotification({ ...data, requestId: request.headers.get('x-request-id')! })
    return reply({ received: true }, 200)
  } catch { return reply({ error: 'Verificación pendiente. Reintentar notificación.' }, 503) }
}

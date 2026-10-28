import { NextRequest } from 'next/server'
import { z } from 'zod'
import { readSmallJson } from '../../../../lib/read-small-json'
import { verifyMercadoPagoSignature } from '../../../../lib/mercado-pago-webhook'
import { mercadoPagoConfig, assertOrderEnvironment } from '../../../../lib/mercado-pago-client'
import { persistMercadoPagoNotification } from '../../../../lib/workshop-payments'

export const runtime = 'nodejs'
const schema = z.object({ id: z.union([z.string(), z.number().int()]).transform(String), type: z.literal('order'),
  action: z.string().max(100), data: z.object({ id: z.string() }), application_id: z.union([z.string(), z.number().int()]).transform(String),
  user_id: z.union([z.string(), z.number().int()]).transform(String), live_mode: z.boolean(),
})
const reply = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('data.id') || ''
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return reply({ error: 'No disponible.' }, 503)
  if (!verifyMercadoPagoSignature({ resourceId: orderId, requestId: request.headers.get('x-request-id'), signature: request.headers.get('x-signature'), secret })) return reply({ error: 'Firma inválida.' }, 401)
  let data: z.infer<typeof schema>
  try {
    data = schema.parse(await readSmallJson(request))
    const config = mercadoPagoConfig(false)
    if (data.data.id.toLowerCase() !== orderId.toLowerCase() || data.application_id !== config.applicationId || data.user_id !== config.sellerUserId || data.live_mode !== config.liveMode) throw new Error('Mismatch')
    assertOrderEnvironment(data.data.id, config.liveMode)
  } catch { return reply({ error: 'Notificación inválida.' }, 400) }
  try {
    await persistMercadoPagoNotification({ eventId: data.id, orderId: data.data.id, action: data.action, requestId: request.headers.get('x-request-id')!, applicationId: data.application_id, sellerUserId: data.user_id, liveMode: data.live_mode })
    return reply({ received: true }, 200)
  } catch { return reply({ error: 'Verificación pendiente. Reintentar notificación.' }, 503) }
}

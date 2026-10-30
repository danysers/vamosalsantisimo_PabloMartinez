import { observePublicRequest } from '../../../../../lib/operational-incidents'
import { publicRequestOrigin } from '../../../../../lib/public-site-origin'
import { NextRequest } from 'next/server'
import { allowPublicOperation, tooManyRequests } from '../../../../../lib/request-rate-limit'
import { z } from 'zod'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { localWorkshopTestMode } from '../../../../../lib/checkout-access'
import { changeWorkshopPaymentMethod, PaymentMethodChangeError } from '../../../../../lib/workshop-payments'

export const runtime = 'nodejs'
const schema = z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  attemptId: z.uuid(), method: z.enum(['mercado_pago','bank_transfer','on_site']) }).strict()
const reply = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
async function handlePost(request: NextRequest) {
  if (!publicRequestOrigin(request)) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  if (process.env.REGISTRATION_EMAIL_READY !== '1' && !localWorkshopTestMode(request.nextUrl.origin)) return reply({ error: 'Servicio temporalmente no disponible.' }, 503)
  let input: z.infer<typeof schema>
  try { input = schema.parse(await readSmallJson(request)) } catch { return reply({ error: 'Elegí una forma de pago válida.' }, 400) }
  try {
    if (!await allowPublicOperation('payment-method')) return tooManyRequests()
    return reply(await changeWorkshopPaymentMethod(input), 200)
  }
  catch (error) {
    if (error instanceof PaymentMethodChangeError) return reply({ error: error.message }, 409)
    return reply({ error: 'No pudimos cambiar el medio de pago. Conservamos tu inscripción; intentá nuevamente en unos instantes.' }, 503)
  }
}

export async function POST(request: NextRequest) {
  return observePublicRequest(request, 'payment_method', () => handlePost(request))
}

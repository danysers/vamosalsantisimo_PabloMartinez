import { observePublicRequest } from '../../../../../lib/operational-incidents'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRequestOrigin } from '../../../../../lib/public-site-origin'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { allowPublicOperation, tooManyRequests } from '../../../../../lib/request-rate-limit'
import { restoreWorkshopPaymentReturn } from '../../../../../lib/workshop-payments'

export const runtime = 'nodejs'
const schema = z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/),
  returnToken: z.string().regex(/^v1\.\d{10}\.[A-Za-z0-9_-]{43}$/) }).strict()
const reply = (body: object, status: number) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow',
} })

async function handlePost(request: NextRequest) {
  if (!publicRequestOrigin(request)) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  let input: z.infer<typeof schema>
  try { input = schema.parse(await readSmallJson(request)) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
  try {
    if (!await allowPublicOperation('payment-return')) return tooManyRequests()
    return reply(await restoreWorkshopPaymentReturn(input), 200)
  } catch { return reply({ error: 'Recuperá el acceso con el código enviado a tu correo. Tu inscripción sigue registrada.' }, 401) }
}

export async function POST(request: NextRequest) {
  return observePublicRequest(request, 'payment_status', () => handlePost(request))
}

import { observePublicRequest } from '../../../../../lib/operational-incidents'
import { publicRequestOrigin } from '../../../../../lib/public-site-origin'
import { NextRequest } from 'next/server'
import { allowPublicOperation, tooManyRequests } from '../../../../../lib/request-rate-limit'
import { z } from 'zod'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { workshopPaymentStatus } from '../../../../../lib/workshop-payments'

export const runtime = 'nodejs'
const schema = z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
const reply = (body: object, status: number) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow',
} })

async function handlePost(request: NextRequest) {
  if (!publicRequestOrigin(request)) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  let access: z.infer<typeof schema>
  try { access = schema.parse(await readSmallJson(request)) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
  try {
    if (!await allowPublicOperation('payment-status')) return tooManyRequests()
    return reply(await workshopPaymentStatus(access), 200)
  }
  catch { return reply({ error: 'No pudimos consultar ese pago. Usá el mismo navegador en el que te inscribiste.' }, 404) }
}

export async function POST(request: NextRequest) {
  return observePublicRequest(request, 'payment_status', () => handlePost(request))
}

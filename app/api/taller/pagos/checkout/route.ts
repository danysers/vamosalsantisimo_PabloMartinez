import { observePublicRequest } from '../../../../../lib/operational-incidents'
import { publicRequestOrigin } from '../../../../../lib/public-site-origin'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { limitRegistrationRequest } from '../../../../../lib/registration-service'
import { startWorkshopCheckout } from '../../../../../lib/workshop-payments'

export const runtime = 'nodejs'
const schema = z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
const reply = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function handlePost(request: NextRequest) {
  if (!publicRequestOrigin(request)) return reply({ error: 'Solicitud inválida.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 400)
  let access: z.infer<typeof schema>
  try { access = schema.parse(await readSmallJson(request)) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
  try {
    if (!await limitRegistrationRequest(request.headers.get('x-real-ip'))) return reply({ error: 'Demasiadas solicitudes. Intentá más tarde.' }, 429)
    return reply(await startWorkshopCheckout(access, undefined, publicRequestOrigin(request)!), 200)
  } catch {
    return reply({ error: 'No pudimos preparar el pago. Tu inscripción sigue registrada: podés reintentar sin crear otra.' }, 503)
  }
}

export async function POST(request: NextRequest) {
  return observePublicRequest(request, 'checkout', () => handlePost(request))
}

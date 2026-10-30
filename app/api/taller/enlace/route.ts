import { observePublicRequest } from '../../../../lib/operational-incidents'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRequestOrigin } from '../../../../lib/public-site-origin'
import { readSmallJson } from '../../../../lib/read-small-json'
import { allowPublicOperation, tooManyRequests } from '../../../../lib/request-rate-limit'
import { readWorkshopEmailLink } from '../../../../lib/workshop-email-access'

export const runtime = 'nodejs'
const schema = z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/),
  token: z.string().regex(/^v1\.\d{10}\.[A-Za-z0-9_-]{43}$/), purpose: z.enum(['proof', 'pass']) }).strict()
const reply = (body: object, status: number) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
} })
async function handlePost(request: NextRequest) {
  if (!publicRequestOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 403)
  let input: z.infer<typeof schema>
  try { input = schema.parse(await readSmallJson(request)) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
  try {
    if (!await allowPublicOperation('email-link')) return tooManyRequests()
    const state = await readWorkshopEmailLink(input)
    return state ? reply(state, 200) : reply({ error: 'Este enlace ya no está disponible. Abrí el correo más reciente o contactá a la organización.' }, 404)
  } catch { return reply({ error: 'No pudimos abrir tu inscripción. Esperá un momento y volvé a intentar.' }, 503) }
}

export async function POST(request: NextRequest) {
  return observePublicRequest(request, 'email_link', () => handlePost(request))
}

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRequestOrigin } from '../../../../lib/public-site-origin'
import { readSmallJson } from '../../../../lib/read-small-json'
import { incidentSchema } from '../../../../lib/incident-policy'
import { recordIncident } from '../../../../lib/operational-incidents'
import { allowPublicOperation, tooManyRequests } from '../../../../lib/request-rate-limit'

export const runtime = 'nodejs'
const schema = incidentSchema.extend({ access: z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/),
  token: z.string().max(80), purpose: z.enum(['proof', 'pass']).optional() }).strict().optional() }).strict()
export async function POST(request: NextRequest) {
  const reply = (body: object, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
  if (!publicRequestOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Solicitud inválida.' }, 403)
  let input: z.infer<typeof schema>
  try { input = schema.parse(await readSmallJson(request, 4096)) } catch { return reply({ error: 'Solicitud inválida.' }, 400) }
  try {
    if (!await allowPublicOperation('incident-report')) return tooManyRequests()
    const { access, ...event } = input
    const stored = await recordIncident(event, 'client', access)
    return reply({ stored, trackingId: event.correlationId }, stored ? 202 : 503)
  } catch { return reply({ error: 'Registro temporalmente no disponible.' }, 503) }
}

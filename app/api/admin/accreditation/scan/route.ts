import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { admitAccreditation } from '../../../../../lib/accreditation-workflow'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'

export const runtime = 'nodejs'
const payload = z.object({
  qrValue: z.string().trim().min(1).max(100),
  entryPoint: z.string().trim().max(80).default(''),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator', 'admission_operator'])
    if ('response' in operator) return operator.response
    if (process.env.ADMISSION_SCAN_ENABLED !== '1') return privateReply({ error: 'El ingreso todavía no está habilitado.' }, 503)
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    const parsed = payload.safeParse(await readSmallJson(request))
    if (!parsed.success) return privateReply({ error: 'Código o punto de ingreso inválido.' }, 400)
    const result = await admitAccreditation(getDb(), { ...parsed.data, eventSlug: operator.eventSlug, operatorId: operator.operatorId })
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`accreditation_scan_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo registrar el ingreso. Verificá el estado antes de reintentar.', correlation }, 503)
  }
}

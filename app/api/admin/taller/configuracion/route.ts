import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { readWorkshopPricing, updateWorkshopPricing } from '../../../../../lib/workshop-admin'

export const runtime = 'nodejs'

const money = z.number().int().min(100).max(200_000_000)
const window = z.iso.datetime({ offset: true }).nullable().optional()
const promotion = z.object({ type: z.literal('promotion'), id: z.uuid().optional(),
  code: z.string().trim().toUpperCase().min(2).max(32).regex(/^[A-Z0-9_-]+$/),
  kind: z.enum(['bundle', 'group_fixed']), active: z.boolean(),
  bundleSize: z.number().int().min(2).max(20).nullable().optional(),
  payablePeople: z.number().int().min(1).max(19).nullable().optional(),
  minPeople: z.number().int().min(2).max(20).nullable().optional(),
  maxPeople: z.number().int().min(2).max(20).nullable().optional(),
  groupTotalMinor: money.nullable().optional(), startsAt: window, endsAt: window,
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'bundle' && (!value.bundleSize || !value.payablePeople || value.payablePeople >= value.bundleSize ||
    value.minPeople != null || value.maxPeople != null || value.groupTotalMinor != null))
    ctx.addIssue({ code: 'custom', message: 'Revisá la cantidad de personas del paquete.' })
  if (value.kind === 'group_fixed' && (!value.minPeople || !value.maxPeople || value.maxPeople < value.minPeople ||
    !value.groupTotalMinor || value.bundleSize != null || value.payablePeople != null))
    ctx.addIssue({ code: 'custom', message: 'Revisá el precio fijo del grupo.' })
})
const change = z.union([
  z.object({ type: z.literal('lot'), number: z.number().int().min(1).max(3), amountMinor: money }).strict(),
  z.object({ type: z.literal('active_lot'), number: z.number().int().min(1).max(3) }).strict(),
  promotion,
])

export async function GET(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'], false)
    if ('response' in operator) return operator.response
    const data = await readWorkshopPricing(getDb(), operator.eventSlug)
    return data ? privateReply(data, 200) : privateReply({ error: 'Taller no encontrado.' }, 404)
  } catch {
    const correlation = randomUUID()
    console.error(`workshop_config_read_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo cargar la configuración.', correlation }, 503)
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    const parsed = change.safeParse(await readSmallJson(request))
    if (!parsed.success) return privateReply({ error: 'Revisá los valores de la configuración.' }, 400)
    const result = await updateWorkshopPricing(getDb(), { change: parsed.data,
      eventSlug: operator.eventSlug, operatorId: operator.operatorId })
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`workshop_config_write_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo guardar la configuración.', correlation }, 503)
  }
}

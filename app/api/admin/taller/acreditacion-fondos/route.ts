import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { configureWorkshopSettlement, readWorkshopSettlement, recordProviderSettlement } from '../../../../../lib/workshop-settlement'

export const runtime = 'nodejs'
const days = z.union([z.literal(0),z.literal(10),z.literal(18),z.literal(35)])
const rate = z.number().int().min(0).max(10000)
const schema = z.discriminatedUnion('action',[
  z.object({action:z.literal('configure'),confirmedFromAccount:z.literal(true),fundsBeforeDays:z.number().int().min(1).max(90),
    reminderLeadDays:z.number().int().min(0).max(30),reminderEmail:z.email().max(254),feeIncludesTax:z.boolean(),
    prepareReminders:z.boolean(),options:z.array(z.object({releaseDays:days,feeBasisPoints:rate}).strict()).length(4)}).strict(),
  z.object({action:z.literal('record_provider_change'),confirmedFromAccount:z.literal(true),releaseDays:days,feeBasisPoints:rate}).strict(),
])

export async function GET(request:NextRequest) {
  try {
    const operator=await authorizeOperator(request,['configuration','registration_operator'],false)
    if ('response' in operator) return operator.response
    return privateReply(await readWorkshopSettlement(getDb(),operator.eventSlug),200)
  } catch {return privateReply({error:'No se pudo cargar el plan de disponibilidad de fondos.'},503)}
}
export async function POST(request:NextRequest) {
  try {
    const operator=await authorizeOperator(request,['configuration'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({error:'Solicitud inválida.'},400)
    const parsed=schema.safeParse(await readSmallJson(request))
    if (!parsed.success) return privateReply({error:'Revisá las tarifas y confirmá que las comprobaste en tu cuenta.'},400)
    const data=parsed.data
    const result=data.action==='configure'
      ? await configureWorkshopSettlement(getDb(),{...data,eventSlug:operator.eventSlug,operatorId:operator.operatorId})
      : await recordProviderSettlement(getDb(),{...data,eventSlug:operator.eventSlug,operatorId:operator.operatorId})
    return privateReply(result,200)
  } catch {return privateReply({error:'No se pudo guardar. Revisá las tarifas de tu cuenta y volvé a consultar el plan.'},409)}
}

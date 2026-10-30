import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { editRegistrationOperations } from '../../../../../lib/registration-operations'

export const runtime='nodejs'
export async function PATCH(request: NextRequest) {
  try {
    const operator=await authorizeOperator(request,['configuration'])
    if('response' in operator)return operator.response
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return privateReply({error:'Solicitud inválida.'},400)
    let input:unknown
    try {input=await readSmallJson(request,12*1024)}catch{return privateReply({error:'Solicitud inválida o demasiado grande.'},400)}
    const result=await editRegistrationOperations(getDb(),operator.eventSlug,operator.operatorId,input)
    return privateReply(result.body,result.code)
  }catch{
    const correlation=randomUUID()
    console.error(JSON.stringify({event:'admin_registration_operations_failed',correlation}))
    return privateReply({error:'No pudimos completar la corrección. Recargá la ficha antes de reintentar.',correlation},503)
  }
}

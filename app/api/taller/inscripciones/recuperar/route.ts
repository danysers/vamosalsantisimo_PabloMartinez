import { NextRequest } from 'next/server'
import { z } from 'zod'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { requestRegistrationRecovery, verifyRegistrationRecovery } from '../../../../../lib/registration-recovery'

export const runtime = 'nodejs'
const schema = z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),identifier:z.string().trim().min(5).max(80).regex(/^[A-Za-z0-9_. -]+$/)}).strict(),
  z.object({action:z.literal('verify'),challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/)}).strict(),
])
const reply = (body:object,status:number) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}})
export async function POST(request:NextRequest) {
  if (request.headers.get('origin')!==(process.env.SITE_ORIGIN||request.nextUrl.origin)) return reply({error:'Solicitud inválida.'},403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({error:'Solicitud inválida.'},400)
  let input:z.infer<typeof schema>
  try { input=schema.parse(await readSmallJson(request,512)) } catch { return reply({error:'Revisá el DNI, número de gestión o código.'},400) }
  try {
    if(input.action==='request') { const result=await requestRegistrationRecovery(input.identifier); return reply(result.body,result.code) }
    const result=await verifyRegistrationRecovery(input.challengeId,input.code)
    return result?reply(result,200):reply({error:'El código no es válido o venció. Solicitá uno nuevo.'},400)
  } catch { return reply({error:'No pudimos recuperar la inscripción. Intentá nuevamente en unos minutos.'},503) }
}

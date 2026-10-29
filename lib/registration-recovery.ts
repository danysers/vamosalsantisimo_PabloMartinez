import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from './db'
import { emailOutbox, registrationRecoveries } from './schema'
import { checkoutAccessToken } from './checkout-access'
import { encryptRecoveryCode, matchesRecoveryCode, recoveryCodeHash } from './recovery-code'

const accepted = 'Si los datos coinciden con una inscripción, recibirás un código en el correo registrado. Revisá también spam.'
async function takeRate(key: string, maximum: number, minutes: number) {
  const result = await getDb().execute(sql`INSERT INTO rate_limits (key,count,window_end)
    VALUES (${key},1,now()+${minutes}*interval '1 minute') ON CONFLICT (key) DO UPDATE SET
    count=CASE WHEN rate_limits.window_end<=now() THEN 1 ELSE rate_limits.count+1 END,
    window_end=CASE WHEN rate_limits.window_end<=now() THEN now()+${minutes}*interval '1 minute' ELSE rate_limits.window_end END RETURNING count`)
  return Number(result.rows[0]?.count) <= maximum
}

export async function requestRegistrationRecovery(identifier: string) {
  const id = randomUUID(), slug = process.env.WORKSHOP_EVENT_SLUG
  if (!slug) throw new Error('Recovery unavailable')
  if (!await takeRate('recovery:global',600,60)) return { code:429, body:{ error:'Esperá unos minutos antes de solicitar otro código.' } }
  const normalized = identifier.trim().toUpperCase().replace(/[.\s]/g, '')
  if (!await takeRate('recovery:identifier:'+recoveryCodeHash('lookup',normalized),3,15)) return { code:202, body:{ challengeId:id,message:accepted } }
  const found = await getDb().execute(sql`SELECT r.id,r.email FROM registrations r
    JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    JOIN registration_intakes i ON i.registration_id=r.id
    WHERE e.slug=${slug} AND r.status<>'cancelled'
      AND registration_is_current(r.id)
      AND (r.reference=${identifier.trim()} OR i.document_number=${normalized})
    ORDER BY r.created_at DESC LIMIT 1`)
  const registration = found.rows[0]
  if (registration) {
    const code = String(randomInt(0,1000000)).padStart(6,'0')
    await getDb().transaction(async tx => {
      await tx.insert(registrationRecoveries).values({ id,registrationId:String(registration.id),
        codeHash:recoveryCodeHash(id,code),codeEncrypted:encryptRecoveryCode(id,code),expiresAt:new Date(Date.now()+15*60_000) })
      await tx.insert(emailOutbox).values({ dedupeKey:`recovery:${id}`,kind:'registration_access',
        registrationId:String(registration.id),recoveryId:id,toEmail:String(registration.email) })
    })
  }
  return { code:202,body:{ challengeId:id,message:accepted } }
}

export async function verifyRegistrationRecovery(id: string, code: string) {
  if (!await takeRate('recovery:verification:global',1500,60)) return null
  return getDb().transaction(async tx => {
    const found = await tx.execute(sql`SELECT c.*,r.reference,r.creation_key FROM registration_recoveries c
      JOIN registrations r ON r.id=c.registration_id JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE c.id=${id} AND e.slug=${process.env.WORKSHOP_EVENT_SLUG||''} FOR UPDATE OF c`)
    const row = found.rows[0]
    if (!row || row.consumed_at || Number(row.attempts)>=5 || new Date(String(row.expires_at)).getTime()<=Date.now()) return null
    if (!matchesRecoveryCode(id,code,String(row.code_hash))) {
      await tx.execute(sql`UPDATE registration_recoveries SET attempts=attempts+1 WHERE id=${id}`)
      return null
    }
    await tx.execute(sql`UPDATE registration_recoveries SET consumed_at=now(),code_encrypted='' WHERE id=${id}`)
    return { reference:String(row.reference),accessToken:checkoutAccessToken(String(row.registration_id),String(row.creation_key)) }
  })
}

import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { getDb } from './db'
import { registrationOperationSchema } from './registration-operations-policy'
import { issueAccreditationAfterApproval } from './accreditation-workflow'
import { fetchCheckoutProOrder, cancelCheckoutProOrder, mercadoPagoConfig, assertOrderEnvironment } from './mercado-pago-client'
import { inspectUnpaidCheckoutOrder } from './checkout-method-contract'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Attempt = { id: string; registration_id: string; source: string; reported_source: string | null; status: string;
  amount_minor: number | null; paid_amount_minor: number; provider_fee_minor: number; reported_fee_minor: number;
  manual_reference: string | null; provider_order_id: string | null; external_reference: string | null; admin_change_id: string | null }
type Allocation = { registration_id: string; lot_id: string; lot_number: number; base_amount_minor: number | null; due_amount_minor: number | null }
type State = { id: string; workshop_id: string; status: string; current: boolean; intake: boolean; version: string;
  registered_at: string; accreditation_blocked: boolean; waived: boolean; assisted: boolean; credential: string | null; admitted: boolean;
  attempt: Attempt | null; allocations: Allocation[] }
const iso = (v: unknown) => new Date(String(v)).toISOString()

async function readState(db: Db | Tx, eventSlug: string, reference: string): Promise<State | null> {
  const result = await db.execute(sql`SELECT r.id,r.workshop_id,r.status,registration_is_current(r.id) AS current,
    i.registration_id IS NOT NULL AS intake,COALESCE(r.registered_at_override,r.created_at) AS registered_at,r.accreditation_blocked,
    fw.registration_id IS NOT NULL AND fw.revoked_at IS NULL AS waived,ar.status='approved' AS assisted,
    c.id AS credential,ci.registration_id IS NOT NULL AS admitted,to_jsonb(p) AS attempt,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('registration_id',a.registration_id,'lot_id',a.lot_id,'lot_number',a.lot_number,
      'base_amount_minor',a.base_amount_minor,'due_amount_minor',a.due_amount_minor) ORDER BY a.registration_id)
      FROM payment_allocations a WHERE a.attempt_id=p.id),'[]'::jsonb) AS allocations,
    md5(jsonb_build_array(r.updated_at,i.updated_at,p.id,p.updated_at,fw.approved_at,fw.revoked_at,ar.updated_at,c.id,ci.scanned_at)::text) AS version
    FROM registrations r JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    LEFT JOIN registration_intakes i ON i.registration_id=r.id
    LEFT JOIN fee_waivers fw ON fw.registration_id=r.id LEFT JOIN assistance_requests ar ON ar.registration_id=r.id
    LEFT JOIN check_ins ci ON ci.registration_id=r.id
    LEFT JOIN LATERAL(SELECT x.* FROM payment_attempts x WHERE x.superseded_by_admin IS NULL AND
      (x.registration_id=r.id OR EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=x.id AND a.registration_id=r.id))
      ORDER BY x.created_at DESC,x.id DESC LIMIT 1)p ON true
    LEFT JOIN LATERAL(SELECT id FROM accreditation_credentials WHERE registration_id=r.id AND revoked_at IS NULL AND expires_at>now()
      ORDER BY version DESC LIMIT 1)c ON true WHERE e.slug=${eventSlug} AND r.reference=${reference}`)
  return result.rows[0] as unknown as State || null
}

export async function readRegistrationOperations(db: Db, eventSlug: string, reference: string) {
  const s = await readState(db,eventSlug,reference)
  if (!s) return null
  return { version: s.version, registrationStatus: s.status, registeredAt: iso(s.registered_at),
    paymentMethod: s.attempt?.reported_source || s.attempt?.source || 'none', paymentStatus: s.attempt?.status || 'pending',
    amountMinor: s.attempt?.amount_minor ?? null, paidAmountMinor: Number(s.attempt?.paid_amount_minor || 0),
    feeMinor: Number(s.attempt?.reported_fee_minor || s.attempt?.provider_fee_minor || 0), manualReference: s.attempt?.manual_reference || '',
    members: Math.max(1,s.allocations.length), administrative: !!s.attempt?.admin_change_id,
    providerOrder: !!s.attempt?.provider_order_id && s.attempt.source==='mercado_pago',
    waived: s.waived, assisted: !!s.assisted, qrBlocked: s.accreditation_blocked, admitted: s.admitted }
}
export type RegistrationOperations = NonNullable<Awaited<ReturnType<typeof readRegistrationOperations>>>

class OperationError extends Error {
  code: number
  constructor(code: number, message: string) { super(message); this.code=code }
}
function fail(code: number, message: string): never { throw new OperationError(code,message) }

export async function editRegistrationOperations(db: Db, eventSlug: string, operatorId: string, data: unknown,
  provider = { load: fetchCheckoutProOrder, cancel: cancelCheckoutProOrder }) {
  const parsed = registrationOperationSchema.safeParse(data)
  if (!parsed.success) return { code:400, body:{ error:parsed.error.issues[0]?.code==='custom' ? parsed.error.issues[0].message : 'Revisá los datos de gestión y el motivo.' } }
  const input=parsed.data, hash=createHash('sha256').update(JSON.stringify(input)).digest('hex')
  try {
    return await db.transaction(async tx => {
      const owner=await tx.execute(sql`SELECT id FROM admin_users WHERE id=${operatorId} AND role='configuration' AND NOT disabled FOR SHARE`)
      if (!owner.rows.length) fail(403,'Tu rol no permite corregir la gestión de pagos.')
      const workshop=await tx.execute(sql`SELECT w.id,w.starts_at,w.capacity,w.active_lot FROM workshops w JOIN events e ON e.id=w.event_id WHERE e.slug=${eventSlug} FOR UPDATE OF w`)
      const w=workshop.rows[0]; if(!w)fail(404,'Inscripción no encontrada.')
      await tx.execute(sql`SELECT id FROM registrations WHERE workshop_id=${String(w.id)} AND reference=${input.reference} FOR UPDATE`)
      const s=await readState(tx,eventSlug,input.reference); if(!s)fail(404,'Inscripción no encontrada.')
      const replay=await tx.execute(sql`SELECT registration_id,payload_hash FROM registration_admin_changes WHERE id=${input.requestId}`)
      if(replay.rows[0]) {
        if(replay.rows[0].registration_id!==s.id||replay.rows[0].payload_hash!==hash)fail(409,'Esta solicitud ya fue utilizada con otros datos.')
        return {code:200,body:{ok:true,replayed:true}}
      }
      if(!s.current||!s.intake)fail(409,'Restaurá o desarchivá el registro antes de editarlo.')
      if(s.version!==input.version)fail(409,'La inscripción cambió. Recargá la ficha antes de guardar.')
      if(new Date(String(w.starts_at)).getTime()+86_400_000<=Date.now()&&input.qrAction==='reissue')fail(409,'El plazo de acreditación venció.')
      const p=s.attempt, method=p?.reported_source||p?.source||'none'
      const financial=input.paymentMethod!==method || (input.paymentMethod!=='none' && (
        input.paymentStatus!==p?.status || input.amountMinor!==p?.amount_minor || input.paidAmountMinor!==Number(p?.paid_amount_minor||0)
        || input.feeMinor!==Number(p?.reported_fee_minor||p?.provider_fee_minor||0) || input.manualReference!==(p?.manual_reference||'')))
      if(financial&&!input.confirmPayment)fail(400,'Confirmá la corrección del registro de pago.')
      if(financial&&input.paymentMethod!=='none'&&input.amountMinor===null)fail(400,'Definí el importe antes de corregir el pago.')
      if((input.qrAction!=='keep'||input.undoAdmission)&&!input.confirmQrChange)fail(400,'Confirmá el cambio de acreditación o ingreso.')
      if(input.paymentMethod==='none'&&(input.paidAmountMinor||input.feeMinor))fail(400,'Sin pago no puede quedar un importe abonado.')
      const allocations=s.allocations, members=allocations.length?allocations.map(a=>a.registration_id):[s.id]
      if(financial&&members.length>1&&!input.confirmGroup)fail(400,'Confirmá que la corrección afecta al pago del grupo completo.')
      const affected=financial?members:[s.id]
      // Bind one PostgreSQL array value; a JS array interpolated into Drizzle SQL becomes a row expression.
      const affectedIds='{'+affected.join(',')+'}'
      if(financial){
        const other=await tx.execute(sql`SELECT 1 FROM payment_attempts x WHERE x.superseded_by_admin IS NULL AND x.id<>${p?.id||null}::uuid
          AND x.status IN('created','pending','approved','review') AND
          (x.registration_id=ANY(${affectedIds}::uuid[]) OR EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=x.id AND a.registration_id=ANY(${affectedIds}::uuid[]))) LIMIT 1`)
        if(other.rows.length)fail(409,'Hay otra operación activa para esta inscripción o su grupo. Revisala antes de corregir el pago.')
      }
      const rows=await tx.execute(sql`SELECT r.id,r.status,r.accreditation_blocked,registration_is_current(r.id) AS current,
        EXISTS(SELECT 1 FROM fee_waivers f WHERE f.registration_id=r.id AND f.revoked_at IS NULL) AS waived,
        EXISTS(SELECT 1 FROM assistance_requests a WHERE a.registration_id=r.id AND a.status='approved') AS assisted,
        EXISTS(SELECT 1 FROM check_ins WHERE registration_id=r.id) AS admitted,
        (r.status='confirmed' OR EXISTS(SELECT 1 FROM reservations h WHERE h.registration_id=r.id AND (h.status='used' OR (h.status='held' AND h.expires_at>now())))) AS has_seat
        FROM registrations r WHERE r.id=ANY(${affectedIds}::uuid[]) ORDER BY r.id FOR UPDATE OF r`)
      if(rows.rows.length!==affected.length||rows.rows.some(r=>!r.current))fail(409,'El grupo contiene registros archivados, eliminados o históricos. Revisalos primero.')
      const nextPaid=input.paymentMethod!=='none'&&input.paymentStatus==='approved'&&input.paidAmountMinor>=(input.amountMinor||0)
      const nextWaived=input.waiver==='grant'||(input.waiver==='keep'&&s.waived)
      if(input.registrationStatus==='confirmed'&&!nextPaid&&!nextWaived&&!s.assisted)fail(400,'Para confirmar, aprobá el pago o autorizá una exención.')
      if(input.qrAction==='reissue'&&input.registrationStatus!=='confirmed')fail(400,'Primero seleccioná una inscripción confirmada para emitir el QR.')
      if(input.qrAction==='reissue'&&input.paymentMethod==='on_site'&&!nextWaived&&!s.assisted)fail(400,'Ventanilla no entrega volante. Usá la gestión de ingreso en recepción.')
      if(input.paymentMethod!=='none'&&financial&&(input.amountMinor||0)-input.feeMinor<members.length)fail(400,'El importe debe permitir asignar al menos un centavo a cada integrante.')
      const targets=rows.rows.map(row=>{
        const r=row as {id:string;status:string;accreditation_blocked:boolean;waived:boolean;assisted:boolean;admitted:boolean;has_seat:boolean}
        const selected=r.id===s.id
        const eligible=nextPaid||(selected?nextWaived:!!r.waived)||!!r.assisted
        const status=selected?input.registrationStatus:eligible&&['pending','confirmed'].includes(String(r.status))&&!r.accreditation_blocked?'confirmed'
          :!eligible&&r.status==='confirmed'?'review':String(r.status)
        // Ordinary unpaid edits must retain the normal approval -> QR workflow.
        // An explicit revocation or a paid registration deliberately put on hold
        // stays blocked until the owner requests a new credential.
        const blocked=selected?(input.qrAction==='revoke'||(input.qrAction!=='reissue'&&(s.accreditation_blocked||(status!=='confirmed'&&eligible)))):!!r.accreditation_blocked
        return {...r,previousStatus:r.status,status,blocked,eligible}
      })
      if(targets.some(r=>r.admitted&&(r.status!=='confirmed'||!r.eligible||r.blocked||(r.id===s.id&&input.qrAction==='reissue'))&&!(r.id===s.id&&input.undoAdmission)))fail(409,'Hay un ingreso registrado. Revertí ese ingreso explícitamente antes de invalidar su acreditación.')
      const occupied=await tx.execute(sql`SELECT count(*)::int AS n FROM registrations r WHERE r.workshop_id=${String(w.id)} AND registration_is_current(r.id)
        AND (r.status='confirmed' OR EXISTS(SELECT 1 FROM reservations h WHERE h.registration_id=r.id AND (h.status='used' OR(h.status='held' AND h.expires_at>now()))))`)
      const extra=targets.filter(r=>!r.has_seat&&r.status!=='cancelled').length
      if(w.capacity!=null&&Number(occupied.rows[0].n)+extra>Number(w.capacity))fail(409,'No hay capacidad disponible para restaurar esos lugares.')
      if(s.status==='cancelled'&&input.registrationStatus!=='cancelled') {
        const duplicate=await tx.execute(sql`SELECT 1 FROM registrations a JOIN registrations b ON b.workshop_id=a.workshop_id AND b.id<>a.id
          LEFT JOIN registration_intakes i ON i.registration_id=a.id LEFT JOIN registration_intakes j ON j.registration_id=b.id
          WHERE a.id=${s.id} AND registration_is_current(b.id) AND b.status<>'cancelled' AND
          ((i.document_number IS NOT NULL AND i.document_number=j.document_number) OR(a.normalized_name=b.normalized_name AND(a.normalized_email=b.normalized_email OR a.normalized_phone=b.normalized_phone))) LIMIT 1`)
        if(duplicate.rows.length)fail(409,'Ya existe otra inscripción activa de esta persona.')
      }
      const jobs=await tx.execute(sql`SELECT status FROM email_outbox WHERE registration_id=ANY(${affectedIds}::uuid[]) AND status IN('queued','failed','sending') FOR UPDATE`)
      if(jobs.rows.some(j=>j.status==='sending'))fail(409,'Hay un correo en envío. Reintentá cuando termine.')
      const previousAdmission=input.undoAdmission?(await tx.execute(sql`SELECT scanned_at,scanned_by,entry_point FROM check_ins WHERE registration_id=${s.id} FOR UPDATE`)).rows[0]||null:null
      if(financial&&p?.source==='mercado_pago'&&p.provider_order_id&&['created','pending','review'].includes(p.status)) {
        const config=mercadoPagoConfig(false)
        assertOrderEnvironment(p.provider_order_id,config.liveMode)
        const expected={orderId:p.provider_order_id,externalReference:p.external_reference!,amountMinor:p.amount_minor!,sellerUserId:config.sellerUserId,applicationId:config.applicationId,liveMode:config.liveMode}
        try {
          let state=inspectUnpaidCheckoutOrder(await provider.load(p.provider_order_id),expected)
          if(!state.canceled) {
            const key=createHash('sha256').update('admin-cancel:'+p.id).digest('hex')
            await provider.cancel(p.provider_order_id,`${key.slice(0,8)}-${key.slice(8,12)}-5${key.slice(13,16)}-a${key.slice(17,20)}-${key.slice(20,32)}`)
            state=inspectUnpaidCheckoutOrder(await provider.load(p.provider_order_id),expected)
          }
          if(!state.canceled)fail(409,'Mercado Pago todavía no confirmó el cierre del enlace anterior.')
        } catch { fail(409,'No se pudo cerrar el enlace de Mercado Pago. Consultá el estado del proveedor y recargá la ficha antes de corregir el pago.') }
      }
      const newId=financial&&input.paymentMethod!=='none'?randomUUID():null
      const fields=['estado de inscripción','fecha registrada',...(financial?['medio y estado de pago','importes']:[]),...(input.qrAction!=='keep'?['acreditación']:[]),...(input.waiver!=='keep'?['exención']:[]),...(input.undoAdmission?['ingreso']:[])]
      await tx.execute(sql`INSERT INTO registration_admin_changes(id,registration_id,operator_id,payload_hash,previous_attempt_id,new_attempt_id,reason,changes)
        VALUES(${input.requestId},${s.id},${operatorId},${hash},${financial?p?.id||null:null},${newId},${input.reason},${JSON.stringify({fields,before:{status:s.status,method,paymentStatus:p?.status,amount:p?.amount_minor,paid:p?.paid_amount_minor,registeredAt:iso(s.registered_at),waived:s.waived,blocked:s.accreditation_blocked,admitted:s.admitted,previousAdmission},after:{...input,version:undefined,requestId:undefined,reference:undefined},members:affected.length})}::jsonb)`)
      if(financial&&p)await tx.execute(sql`UPDATE payment_attempts SET superseded_by_admin=${input.requestId},updated_at=now() WHERE id=${p.id}`)
      if(newId) {
        const source=input.paymentMethod==='mercado_pago'&&!['created','pending'].includes(input.paymentStatus)?'manual':input.paymentMethod
        const sourceFee=source==='mercado_pago'?input.feeMinor:0
        const payer=p?.registration_id||s.id
        await tx.execute(sql`INSERT INTO payment_attempts(id,registration_id,source,status,amount_minor,provider_fee_minor,reported_source,reported_fee_minor,
          idempotency_key,external_reference,admin_change_id,payer_name,payer_email,manual_reference)
          SELECT ${newId},r.id,${source}::payment_source,'created',${input.amountMinor},${sourceFee},${input.paymentMethod}::payment_source,${input.feeMinor},
            ${randomUUID()},${source==='mercado_pago'?'VAS-ADMIN-'+randomUUID():null},${input.requestId},r.name,r.email,${input.manualReference||null}
          FROM registrations r WHERE r.id=${payer}`)
        let list=allocations
        if(!list.length) {
          const lot=await tx.execute(sql`SELECT id,number,amount_minor FROM workshop_lots WHERE workshop_id=${String(w.id)} AND number=${Number(w.active_lot)}`)
          if(!lot.rows[0])fail(409,'Configurá el lote del taller antes de registrar un pago.')
          list=[{registration_id:s.id,lot_id:String(lot.rows[0].id),lot_number:Number(lot.rows[0].number),base_amount_minor:Number(lot.rows[0].amount_minor),due_amount_minor:Number(lot.rows[0].amount_minor)}]
        }
        const total=input.amountMinor!-sourceFee, remainder=total-list.length
        const weights=list.map(a=>Math.max(0,a.due_amount_minor||0)), weight=weights.reduce((a,b)=>a+b,0)||list.length
        let allocated=0
        for(let i=0;i<list.length;i++) {
          const a=list[i],due=i===list.length-1?total-allocated:1+Math.floor(remainder*(weights[i]||(!weights.some(Boolean)?1:0))/weight)
          allocated+=due
          const base=source==='on_site'?due:Math.max(due,a.base_amount_minor||due)
          await tx.execute(sql`INSERT INTO payment_allocations(attempt_id,registration_id,lot_id,lot_number,base_amount_minor,discount_minor,due_amount_minor,admin_change_id)
            VALUES(${newId},${a.registration_id},${a.lot_id},${a.lot_number},${base},${base-due},${due},${input.requestId})`)
        }
        await tx.execute(sql`UPDATE payment_attempts SET status=${input.paymentStatus}::payment_status,paid_amount_minor=${input.paidAmountMinor},
          manual_verified_by=${input.paymentStatus==='approved'&&source!=='mercado_pago'?operatorId:null},
          manual_verified_at=${input.paymentStatus==='approved'&&source!=='mercado_pago'?new Date():null},updated_at=now() WHERE id=${newId}`)
      }
      if(input.waiver==='grant') await tx.execute(sql`INSERT INTO fee_waivers(registration_id,reason,approved_by) VALUES(${s.id},${input.reason},${operatorId})
        ON CONFLICT(registration_id) DO UPDATE SET reason=EXCLUDED.reason,approved_by=EXCLUDED.approved_by,approved_at=now(),revoked_at=NULL,revoked_by=NULL,note=NULL`)
      if(input.waiver==='revoke')await tx.execute(sql`UPDATE fee_waivers SET revoked_at=now(),revoked_by=${operatorId},note=${input.reason} WHERE registration_id=${s.id} AND revoked_at IS NULL`)
      if(input.undoAdmission)await tx.execute(sql`DELETE FROM check_ins WHERE registration_id=${s.id}`)
      let emailsQueued=0
      for(const target of targets) {
        const id=String(target.id), selected=id===s.id
        const revoke=!target.eligible||target.status!=='confirmed'||target.blocked||(selected&&input.qrAction==='reissue')
        if(financial||revoke)await tx.execute(sql`UPDATE email_outbox SET status='cancelled',last_error_code='administrative_correction' WHERE registration_id=${id} AND status IN('queued','failed')
          AND kind IN('registration_received','payment_instructions','payment_proof_reminder','group_payment_notice','accreditation_ready')`)
        if(revoke)await tx.execute(sql`UPDATE accreditation_credentials SET revoked_at=now(),revoked_by=${operatorId},revocation_reason=${input.reason} WHERE registration_id=${id} AND revoked_at IS NULL`)
        await tx.execute(sql`UPDATE registrations SET status=${target.status}::registration_status,accreditation_blocked=${target.blocked},
          registered_at_override=CASE WHEN id=${s.id} THEN ${input.registeredAt?new Date(input.registeredAt):null} ELSE registered_at_override END,updated_at=now() WHERE id=${id}`)
        const seatStatus=target.status==='cancelled'?'released':target.status==='confirmed'?'used':'held'
        await tx.execute(sql`UPDATE reservations SET status=${seatStatus}::reservation_status,expires_at=${new Date(String(w.starts_at))} WHERE registration_id=${id}`)
        if(seatStatus!=='released')await tx.execute(sql`INSERT INTO reservations(registration_id,status,expires_at) SELECT ${id},${seatStatus}::reservation_status,${new Date(String(w.starts_at))}
          WHERE NOT EXISTS(SELECT 1 FROM reservations WHERE registration_id=${id})`)
        if(target.status==='confirmed'&&target.eligible&&!target.blocked) {
          const issued=await issueAccreditationAfterApproval(tx,{registrationId:id,eventSlug,operatorId,notify:false})
          if(issued.code!==200&&issued.code!==201)fail(409,'No se pudo emitir la acreditación. No se guardaron los cambios.')
          if(input.notify && issued.body.credentialId && (input.paymentMethod!=='on_site'||target.waived||target.assisted||(selected&&input.waiver==='grant'))) {
            await tx.execute(sql`INSERT INTO email_outbox(dedupe_key,kind,to_email,registration_id,credential_id,manual_resend,next_attempt_at)
              SELECT ${'admin-correction:'+input.requestId+':'+id},'accreditation_ready',lower(COALESCE(accreditation_email,email)),id,${String(issued.body.credentialId)},true,now()+interval '60 seconds'
              FROM registrations WHERE id=${id} ON CONFLICT(dedupe_key) DO NOTHING`)
            emailsQueued++
          }
        }
        await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,reason,changes) VALUES(${operatorId},'registration.operations_updated',${id},${input.reason},
          ${JSON.stringify({fields,changeId:input.requestId,group:affected.length>1,fromStatus:target.previousStatus,toStatus:target.status,financial})}::jsonb)`)
      }
      await tx.execute(sql`SELECT advance_workshop_lot(${String(w.id)})`)
      return {code:200,body:{ok:true,emailsQueued,members:affected.length}}
    })
  } catch(error) {
    if(error instanceof OperationError)return {code:error.code,body:{error:error.message}}
    throw error
  }
}

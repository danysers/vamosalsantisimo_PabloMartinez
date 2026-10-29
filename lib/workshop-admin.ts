import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { getDb } from './db'
import { normalizeIdentity } from './registration-policy'
import { quoteWorkshopPayment, type PricedMember, type Promotion } from './workshop-pricing'
import type { WorkshopPerson } from './workshop-input'
import {
  auditLog, emailOutbox, paymentAllocations, paymentAttempts, registrationIntakes,
  registrations, reservations, workshopLots, workshopPromotions, workshops,
} from './schema'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Result = { code: number; body: Record<string, unknown> }
type PaymentMethod = 'bank_transfer' | 'on_site'
export type GroupDraft = {
  mode: 'existing' | 'new'
  references?: string[]
  people?: WorkshopPerson[]
  payerReference?: string
  payerIndex?: number
  paymentMethod: PaymentMethod
  promotionId?: string | null
  idempotencyKey?: string
  expectedQuoteHash?: string
}

const invalid = (error: string, code = 409): Result => ({ code, body: { error } })
const toDate = (value: string | null | undefined) => value ? new Date(value) : null

async function lockWorkshop(tx: Tx, eventSlug: string, advanceLot = false) {
  const found = await tx.execute(sql`
    SELECT w.id,w.active_lot,w.capacity,w.registration_open,w.starts_at,w.live_started_at
    FROM workshops w JOIN events e ON e.id=w.event_id
    WHERE e.slug=${eventSlug} FOR UPDATE OF w
  `)
  const workshop = found.rows[0] as { id: string; active_lot: number; capacity: number | null;
    registration_open: boolean; starts_at: Date; live_started_at: Date | null } | undefined
  if (workshop && advanceLot) {
    const result = await tx.execute(sql`SELECT advance_workshop_lot(${workshop.id}) AS active_lot`)
    workshop.active_lot = Number(result.rows[0].active_lot)
  }
  return workshop
}

export async function readWorkshopPricing(db: Db, eventSlug: string) {
  const found = await db.execute(sql`
    SELECT w.id,w.active_lot,w.registration_open,w.capacity,w.lot_automation_enabled,w.lot_notification_email
    FROM workshops w JOIN events e ON e.id=w.event_id WHERE e.slug=${eventSlug}
  `)
  const workshop = found.rows[0] as { id: string; active_lot: number; registration_open: boolean; capacity: number | null;
    lot_automation_enabled: boolean; lot_notification_email: string | null } | undefined
  if (!workshop) return null
  const [lots, promotions, settings, history] = await Promise.all([
    db.select({ id: workshopLots.id, number: workshopLots.number, amountMinor: workshopLots.amountMinor,
      advanceAfter: workshopLots.advanceAfter,
      paidPlaces: sql<number>`workshop_lot_paid_places(${workshop.id},${workshopLots.number})`,
      updatedAt: workshopLots.updatedAt }).from(workshopLots).where(eq(workshopLots.workshopId, workshop.id)).orderBy(workshopLots.number),
    db.select().from(workshopPromotions).where(eq(workshopPromotions.workshopId, workshop.id)).orderBy(workshopPromotions.code),
    db.execute(sql`SELECT transfer_enabled,on_site_enabled,online_service_fee_minor,on_site_price_minor,reminder_email FROM workshop_payment_settings WHERE workshop_id=${workshop.id}`),
    db.execute(sql`SELECT c.id,c.from_lot,c.to_lot,c.threshold,c.paid_places,c.to_email,c.created_at,o.status AS email_status
      FROM workshop_lot_changes c LEFT JOIN email_outbox o ON o.lot_change_id=c.id AND o.kind='lot_changed'
      WHERE c.workshop_id=${workshop.id} ORDER BY c.created_at DESC,c.id DESC LIMIT 10`),
  ])
  const serviceFeeMinor = Number(settings.rows[0]?.online_service_fee_minor ?? 0)
  return { workshopId: workshop.id, activeLot: workshop.active_lot, registrationOpen: workshop.registration_open,
    capacity: workshop.capacity, emailReady: process.env.REGISTRATION_EMAIL_READY === '1',
    lotAutomation: { enabled: workshop.lot_automation_enabled,
      notificationEmail: workshop.lot_notification_email ?? String(settings.rows[0]?.reminder_email ?? ''),
      history: history.rows.map(row => ({ id: String(row.id), fromLot: Number(row.from_lot), toLot: Number(row.to_lot),
        threshold: Number(row.threshold), paidPlaces: Number(row.paid_places), toEmail: String(row.to_email),
        createdAt: new Date(String(row.created_at)).toISOString(), emailStatus: String(row.email_status ?? 'queued') })) },
    serviceFeeMinor, onSitePriceMinor: settings.rows[0]?.on_site_price_minor == null ? null : Number(settings.rows[0].on_site_price_minor),
    lots: lots.map(lot => ({ ...lot, serviceFeeMinor, onlineAmountMinor: lot.amountMinor + serviceFeeMinor })),
    promotions: promotions.map(p => ({ ...p, startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
    paymentMethods: { bankTransfer: settings.rows[0]?.transfer_enabled === true, onSite: settings.rows[0]?.on_site_enabled === true } }
}

export async function searchPendingIndividualRegistrations(db: Db, eventSlug: string, query: string) {
  const term = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`
  const found = await db.execute(sql`
    SELECT r.reference,r.name,r.email,r.created_at,a.lot_number,a.base_amount_minor
    FROM registrations r JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    JOIN registration_intakes i ON i.registration_id=r.id
    JOIN payment_allocations a ON a.registration_id=r.id
    JOIN payment_attempts p ON p.id=a.attempt_id
    WHERE e.slug=${eventSlug} AND r.status='pending' AND p.status='pending'
      AND registration_is_current(r.id)
      AND p.source IN ('bank_transfer','on_site')
      AND NOT EXISTS (SELECT 1 FROM assistance_requests x WHERE x.registration_id=r.id)
      AND NOT EXISTS (SELECT 1 FROM accreditation_credentials c WHERE c.registration_id=r.id AND c.revoked_at IS NULL)
      AND (SELECT count(*) FROM payment_allocations other WHERE other.attempt_id=p.id)=1
      AND (r.reference ILIKE ${term} ESCAPE '\\' OR r.name ILIKE ${term} ESCAPE '\\' OR r.email ILIKE ${term} ESCAPE '\\')
    ORDER BY r.created_at DESC LIMIT 30
  `)
  return found.rows.map(row => ({ reference: row.reference as string, name: row.name as string,
    email: row.email as string, createdAt: new Date(String(row.created_at)).toISOString(),
    lotNumber: Number(row.lot_number), amountMinor: row.base_amount_minor == null ? null : Number(row.base_amount_minor) }))
}

export async function updateWorkshopPricing(db: Db, input: {
  eventSlug: string; operatorId: string;
  change: { type: 'lot'; number: number; amountMinor: number }
    | { type: 'active_lot'; number: number }
    | { type: 'online_fee'; amountMinor: number }
    | { type: 'on_site_price'; amountMinor: number | null }
    | { type: 'lot_automation'; enabled: boolean; notificationEmail: string; limits: { lot1: number | null; lot2: number | null } }
    | { type: 'promotion'; id?: string; code: string; kind: 'bundle' | 'group_fixed'; active: boolean;
      bundleSize?: number | null; payablePeople?: number | null; minPeople?: number | null; maxPeople?: number | null;
      groupTotalMinor?: number | null; startsAt?: string | null; endsAt?: string | null }
}): Promise<Result> {
  return db.transaction(async tx => {
    const workshop = await lockWorkshop(tx, input.eventSlug)
    if (!workshop) return invalid('Taller no encontrado.', 404)
    const change = input.change
    if (change.type === 'lot') {
      const [before] = await tx.select().from(workshopLots).where(and(eq(workshopLots.workshopId, workshop.id), eq(workshopLots.number, change.number))).limit(1)
      if (!before) return invalid('Lote no encontrado.', 404)
      await tx.update(workshopLots).set({ amountMinor: change.amountMinor, updatedAt: new Date() }).where(eq(workshopLots.id, before.id))
      await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.lot_updated', subjectId: before.id,
        changes: { lot: change.number, fromMinor: before.amountMinor, toMinor: change.amountMinor } })
    } else if (change.type === 'active_lot') {
      const [lot] = await tx.select({ id: workshopLots.id }).from(workshopLots)
        .where(and(eq(workshopLots.workshopId, workshop.id), eq(workshopLots.number, change.number))).limit(1)
      if (!lot) return invalid('Lote no encontrado.', 404)
      await tx.update(workshops).set({ activeLot: change.number }).where(eq(workshops.id, workshop.id))
      await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.active_lot_changed', subjectId: workshop.id,
        changes: { from: workshop.active_lot, to: change.number } })
    } else if (change.type === 'online_fee') {
      const [settings] = await tx.execute(sql`SELECT online_service_fee_minor FROM workshop_payment_settings WHERE workshop_id=${workshop.id} FOR UPDATE`).then(result => result.rows)
      if (!settings) return invalid('Configuración de pago no encontrada.', 404)
      await tx.execute(sql`UPDATE workshop_payment_settings SET online_service_fee_minor=${change.amountMinor},updated_at=now() WHERE workshop_id=${workshop.id}`)
      await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.online_fee_updated', subjectId: workshop.id,
        changes: { fromMinor: Number(settings.online_service_fee_minor), toMinor: change.amountMinor } })
    } else if (change.type === 'on_site_price') {
      const [settings] = await tx.execute(sql`SELECT on_site_price_minor FROM workshop_payment_settings WHERE workshop_id=${workshop.id} FOR UPDATE`).then(result => result.rows)
      if (!settings) return invalid('Configuración de pago no encontrada.', 404)
      await tx.execute(sql`UPDATE workshop_payment_settings SET on_site_price_minor=${change.amountMinor},updated_at=now() WHERE workshop_id=${workshop.id}`)
      await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.on_site_price_updated', subjectId: workshop.id,
        changes: { fromMinor: settings.on_site_price_minor == null ? null : Number(settings.on_site_price_minor), toMinor: change.amountMinor } })
    } else if (change.type === 'lot_automation') {
      const email = change.notificationEmail.trim().toLowerCase()
      const limits = [change.limits.lot1, change.limits.lot2]
      if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
          limits.some(limit => limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000)) ||
          (change.enabled && (!email || limits.every(limit => limit === null)))) return invalid('Ingresá un correo válido y al menos un límite de lugares pagados.', 400)
      if (change.enabled && process.env.REGISTRATION_EMAIL_READY !== '1') return invalid('Primero habilitá el envío de correos del taller.', 409)
      const [before] = await tx.select({ enabled: workshops.lotAutomationEnabled, email: workshops.lotNotificationEmail })
        .from(workshops).where(eq(workshops.id, workshop.id))
      const oldLimits = await tx.select({ number: workshopLots.number, advanceAfter: workshopLots.advanceAfter })
        .from(workshopLots).where(eq(workshopLots.workshopId, workshop.id))
      if (limits.some((limit, i) => limit !== null && (!oldLimits.some(lot => lot.number === i + 1) ||
          !oldLimits.some(lot => lot.number === i + 2)))) return invalid('Falta configurar el siguiente lote.', 409)
      for (let i = 0; i < limits.length; i++) {
        await tx.update(workshopLots).set({ advanceAfter: limits[i], updatedAt: new Date() })
          .where(and(eq(workshopLots.workshopId, workshop.id), eq(workshopLots.number, i + 1)))
      }
      await tx.update(workshops).set({ lotAutomationEnabled: change.enabled, lotNotificationEmail: email || null })
        .where(eq(workshops.id, workshop.id))
      await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.lot_automation_configured', subjectId: workshop.id,
        changes: { before: { ...before, limits: oldLimits }, enabled: change.enabled, notificationEmail: email, limits: change.limits } })
      await tx.execute(sql`SELECT advance_workshop_lot(${workshop.id})`)
    } else {
      const startsAt = toDate(change.startsAt)
      const endsAt = toDate(change.endsAt)
      if ((startsAt && !Number.isFinite(startsAt.getTime())) || (endsAt && !Number.isFinite(endsAt.getTime())) ||
          (startsAt && endsAt && startsAt >= endsAt)) return invalid('Revisá las fechas de vigencia.', 400)
      const shape = change.kind === 'bundle'
        ? { bundleSize: change.bundleSize!, payablePeople: change.payablePeople!, minPeople: null, maxPeople: null, groupTotalMinor: null }
        : { bundleSize: null, payablePeople: null, minPeople: change.minPeople!, maxPeople: change.maxPeople!, groupTotalMinor: change.groupTotalMinor! }
      if (change.id) {
        const [previous] = await tx.select().from(workshopPromotions)
          .where(and(eq(workshopPromotions.id, change.id), eq(workshopPromotions.workshopId, workshop.id))).limit(1)
        if (!previous) return invalid('Promoción no encontrada.', 404)
        const [usage] = await tx.select({ id: paymentAllocations.id }).from(paymentAllocations)
          .where(eq(paymentAllocations.promotionId, previous.id)).limit(1)
        if (usage && (previous.code !== change.code || previous.kind !== change.kind ||
          previous.bundleSize !== shape.bundleSize || previous.payablePeople !== shape.payablePeople ||
          previous.minPeople !== shape.minPeople || previous.maxPeople !== shape.maxPeople ||
          previous.groupTotalMinor !== shape.groupTotalMinor ||
          previous.startsAt?.toISOString() !== (startsAt?.toISOString()) ||
          previous.endsAt?.toISOString() !== (endsAt?.toISOString()))) {
          return invalid('Esta promoción ya fue usada: solo podés activarla o desactivarla. Creá otro código para cambiar sus condiciones.')
        }
        await tx.update(workshopPromotions).set({ code: change.code, kind: change.kind, active: change.active,
          ...shape, startsAt, endsAt, updatedAt: new Date() }).where(eq(workshopPromotions.id, previous.id))
        await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.promotion_updated', subjectId: previous.id,
          changes: { code: change.code, active: change.active, priorActive: previous.active,
            kind: change.kind, ...shape, startsAt: change.startsAt || null, endsAt: change.endsAt || null } })
      } else {
        const [created] = await tx.insert(workshopPromotions).values({ workshopId: workshop.id,
          code: change.code, kind: change.kind, active: change.active, ...shape, startsAt, endsAt }).returning({ id: workshopPromotions.id })
        await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.promotion_created', subjectId: created.id,
          changes: { code: change.code, active: change.active, kind: change.kind, ...shape } })
      }
    }
    return { code: 200, body: { ok: true } }
  })
}

function requestHash(draft: GroupDraft) {
  const canonical = draft.mode === 'existing'
    ? { mode: draft.mode, references: [...(draft.references ?? [])].sort(), payer: draft.payerReference,
      paymentMethod: draft.paymentMethod, promotionId: draft.promotionId ?? null }
    : { mode: draft.mode, people: draft.people, payerIndex: draft.payerIndex,
      paymentMethod: draft.paymentMethod, promotionId: draft.promotionId ?? null }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export async function quoteOrCreateGroup(db: Db, input: GroupDraft & { eventSlug: string; operatorId?: string }, create: boolean): Promise<Result> {
  return db.transaction(async tx => {
    const workshop = await lockWorkshop(tx, input.eventSlug, true)
    if (!workshop) return invalid('Taller no encontrado.', 404)
    if (new Date(workshop.starts_at) <= new Date()) return invalid('El taller ya comenzó.', 409)
    if (create && (!workshop.registration_open || process.env.REGISTRATION_EMAIL_READY !== '1')) {
      return invalid('Las inscripciones aún están cerradas.', 503)
    }
    const settings = await tx.execute(sql`SELECT transfer_enabled,on_site_enabled,on_site_price_minor,transfer_alias,transfer_provider,proof_whatsapp_e164
      FROM workshop_payment_settings WHERE workshop_id=${workshop.id}`)
    const method = settings.rows[0] as { transfer_enabled: boolean; on_site_enabled: boolean; on_site_price_minor: number | null; transfer_alias: string | null;
      transfer_provider: string | null; proof_whatsapp_e164: string | null } | undefined
    if (!method || (input.paymentMethod === 'bank_transfer' && (!method.transfer_enabled || !method.transfer_alias || !method.transfer_provider || !method.proof_whatsapp_e164)) ||
      (input.paymentMethod === 'on_site' && !method.on_site_enabled)) return invalid('La forma de pago no está habilitada.', 409)
    if (input.paymentMethod === 'on_site' && method.on_site_price_minor == null) return invalid('El precio de ventanilla aún no está definido. Las inscripciones individuales pueden quedar pendientes; los grupos requieren un importe antes de cotizar.', 409)
    if (input.paymentMethod === 'on_site' && input.promotionId) return invalid('El pago en efectivo en el taller no admite promociones.', 409)
    if (create && (!input.operatorId || !input.idempotencyKey)) return invalid('Falta identificar la operación.', 400)
    const hash = requestHash(input)
    if (create) {
      const [replay] = await tx.select({ id: paymentAttempts.id, groupRequestHash: paymentAttempts.groupRequestHash,
        amountMinor: paymentAttempts.amountMinor, status: paymentAttempts.status }).from(paymentAttempts)
        .where(eq(paymentAttempts.idempotencyKey, input.idempotencyKey!)).limit(1)
      if (replay) {
        if (replay.groupRequestHash !== hash) return invalid('Esa operación ya fue usada con otros datos.')
        const saved = await tx.execute(sql`
          SELECT a.registration_id,r.reference,r.name,a.lot_number,a.base_amount_minor,a.discount_minor,a.due_amount_minor,
            payer.reference AS payer_reference
          FROM payment_allocations a JOIN registrations r ON r.id=a.registration_id
          JOIN payment_attempts p ON p.id=a.attempt_id JOIN registrations payer ON payer.id=p.registration_id
          WHERE a.attempt_id=${replay.id} ORDER BY a.created_at,a.id
        `)
        const savedMembers = saved.rows as Array<{ reference: string; name: string; lot_number: number;
          base_amount_minor: number; discount_minor: number; due_amount_minor: number; payer_reference: string }>
        return { code: 200, body: { attemptId: replay.id, status: replay.status, replayed: true,
          amountMinor: replay.amountMinor, subtotalMinor: savedMembers.reduce((sum, row) => sum + row.base_amount_minor, 0),
          discountMinor: savedMembers.reduce((sum, row) => sum + row.discount_minor, 0),
          quoteHash: input.expectedQuoteHash, payerReference: savedMembers[0]?.payer_reference,
          members: savedMembers.map(row => ({ reference: row.reference, name: row.name, lotNumber: row.lot_number,
            baseAmountMinor: row.base_amount_minor, discountMinor: row.discount_minor, dueAmountMinor: row.due_amount_minor })) } }
      }
    }
    const existing = input.mode === 'existing'
    const count = existing ? input.references?.length ?? 0 : input.people?.length ?? 0
    if (count < 2 || count > 20) return invalid('El grupo debe tener entre 2 y 20 personas.', 400)
    const members: Array<{ registrationId: string; reference: string | null; name: string; email: string;
      lotId: string; lotNumber: number; baseAmountMinor: number; oldAttemptId?: string }> = []
    if (existing) {
      const references = input.references!
      if (new Set(references).size !== count || !references.includes(input.payerReference ?? '')) return invalid('Revisá las referencias y elegí un pagador del grupo.', 400)
      for (const reference of references) {
        const result = await tx.execute(sql`
          SELECT r.id,r.reference,r.name,r.email,r.status, i.registration_id AS intake_id,
            a.status AS assistance_status, fw.registration_id AS waived, c.id AS credential_id,
            registration_has_approved_payment(r.id) AS paid,
            EXISTS (SELECT 1 FROM reservations h WHERE h.registration_id=r.id
              AND (h.status='used' OR (h.status='held' AND h.expires_at>now()))) AS has_place
          FROM registrations r JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
          LEFT JOIN registration_intakes i ON i.registration_id=r.id
          LEFT JOIN assistance_requests a ON a.registration_id=r.id
          LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
          LEFT JOIN accreditation_credentials c ON c.registration_id=r.id AND c.revoked_at IS NULL
          WHERE r.reference=${reference} AND e.slug=${input.eventSlug} AND registration_is_current(r.id) FOR UPDATE OF r
        `)
        const row = result.rows[0] as { id: string; reference: string; name: string; email: string; status: string;
          intake_id: string | null; assistance_status: string | null; waived: string | null;
          credential_id: string | null; paid: boolean; has_place: boolean } | undefined
        if (!row || row.status !== 'pending' || !row.intake_id || !row.has_place ||
          row.assistance_status || row.waived || row.credential_id || row.paid) {
          return invalid(`La referencia ${reference} no está pendiente y disponible para un pago grupal.`)
        }
        const payments = await tx.execute(sql`
          SELECT p.id,p.status,p.source,p.provider_order_id,a.lot_id,a.lot_number,a.base_amount_minor,
            l.amount_minor AS current_lot_amount,
            (SELECT count(*)::int FROM payment_allocations x WHERE x.attempt_id=p.id) AS member_count
          FROM payment_allocations a JOIN payment_attempts p ON p.id=a.attempt_id
          JOIN workshop_lots l ON l.id=a.lot_id
          WHERE a.registration_id=${row.id} AND p.status IN ('created','pending','review','approved')
          FOR UPDATE OF p
        `)
        if (payments.rows.length !== 1) return invalid(`La referencia ${reference} no tiene un pago individual pendiente único.`)
        const payment = payments.rows[0] as { id: string; status: string; source: string; provider_order_id: string | null;
          lot_id: string; lot_number: number; base_amount_minor: number; current_lot_amount: number; member_count: number }
        if (payment.status !== 'pending' || !['bank_transfer', 'on_site'].includes(payment.source) ||
          payment.provider_order_id || Number(payment.member_count) !== 1) return invalid(`El pago de ${reference} ya está en otro proceso.`)
        if (input.paymentMethod === 'bank_transfer' && payment.source === 'bank_transfer' && payment.base_amount_minor !== payment.current_lot_amount) return invalid(`El lote de ${reference} cambió de precio; no se puede recotizar automáticamente.`)
        members.push({ registrationId: row.id, reference, name: row.name, email: row.email,
          lotId: payment.lot_id, lotNumber: payment.lot_number, baseAmountMinor: input.paymentMethod === 'on_site' ? method.on_site_price_minor! : Number(payment.current_lot_amount),
          oldAttemptId: payment.id })
      }
    } else {
      const people = input.people!
      if (!Number.isInteger(input.payerIndex) || input.payerIndex! < 0 || input.payerIndex! >= count) return invalid('Elegí un pagador del grupo.', 400)
      const [lot] = await tx.select().from(workshopLots).where(and(eq(workshopLots.workshopId, workshop.id), eq(workshopLots.number, workshop.active_lot))).limit(1)
      if (!lot) return invalid('No hay un lote activo.', 409)
      if (workshop.capacity !== null) {
        const occupied = await tx.execute(sql`SELECT count(*)::int AS total FROM reservations h JOIN registrations r ON r.id=h.registration_id
          WHERE r.workshop_id=${workshop.id} AND registration_is_current(r.id) AND (h.status='used' OR (h.status='held' AND h.expires_at>now()))`)
        if (Number(occupied.rows[0]?.total) + count > workshop.capacity) return invalid('No quedan lugares suficientes para el grupo.')
      }
      const identities = people.map(person => normalizeIdentity({ name: `${person.firstName} ${person.lastName}`, email: person.email, phone: person.phone }))
      for (let i = 0; i < count; i++) {
        if (identities.some((other, j) => j < i && other.name === identities[i].name &&
          (other.email === identities[i].email || other.phone === identities[i].phone))) return invalid('Hay una persona repetida dentro del grupo.')
        const conflict = await tx.execute(sql`SELECT id FROM registrations WHERE workshop_id=${workshop.id} AND registration_is_current(id) AND status<>'cancelled'
          AND normalized_name=${identities[i].name} AND (normalized_email=${identities[i].email} OR normalized_phone=${identities[i].phone}) LIMIT 1`)
        if (conflict.rows.length) return invalid(`${people[i].firstName} ${people[i].lastName} ya tiene una inscripción. Usá su referencia en un grupo existente.`)
        members.push({ registrationId: `draft-${i}`, reference: null,
          name: `${people[i].firstName.trim()} ${people[i].lastName.trim()}`, email: identities[i].email,
          lotId: lot.id, lotNumber: lot.number, baseAmountMinor: input.paymentMethod === 'on_site' ? method.on_site_price_minor! : lot.amountMinor })
      }
    }
    let promotion: Promotion | undefined
    if (input.promotionId) {
      const [row] = await tx.select().from(workshopPromotions)
        .where(and(eq(workshopPromotions.id, input.promotionId), eq(workshopPromotions.workshopId, workshop.id))).limit(1)
      if (!row || !row.active || (row.startsAt && row.startsAt > new Date()) || (row.endsAt && row.endsAt <= new Date())) {
        return invalid('La promoción no está vigente.')
      }
      promotion = row.kind === 'bundle'
        ? { id: row.id, code: row.code, kind: 'bundle', bundleSize: row.bundleSize!, payablePeople: row.payablePeople! }
        : { id: row.id, code: row.code, kind: 'group_fixed', minPeople: row.minPeople!, maxPeople: row.maxPeople!, groupTotalMinor: row.groupTotalMinor! }
    }
    let quote: ReturnType<typeof quoteWorkshopPayment>
    try {
      quote = quoteWorkshopPayment(members.map(({ registrationId, lotId, lotNumber, baseAmountMinor }): PricedMember =>
        ({ registrationId, lotId, lotNumber, baseAmountMinor })), promotion)
    } catch { return invalid('Esta promoción no corresponde a la cantidad de personas o a sus lotes.') }
    const quoteHash = createHash('sha256').update(JSON.stringify({
      members: quote.allocations.map(({ lotId, lotNumber, baseAmountMinor, discountMinor, dueAmountMinor }) =>
        ({ lotId, lotNumber, baseAmountMinor, discountMinor, dueAmountMinor })),
      amountMinor: quote.amountMinor, promotionId: promotion?.id ?? null, payer: input.mode === 'existing' ? input.payerReference : input.payerIndex,
      source: input.paymentMethod,
    })).digest('hex')
    if (create && input.expectedQuoteHash !== quoteHash) return invalid('La cotización cambió. Volvé a calcular antes de registrar el grupo.')
    const preview = { amountMinor: quote.amountMinor, subtotalMinor: quote.subtotalMinor, discountMinor: quote.discountMinor,
      paymentMethod: input.paymentMethod, promotionCode: promotion?.code ?? null, quoteHash,
      members: members.map((member, i) => ({ reference: member.reference, name: member.name,
        lotNumber: member.lotNumber, baseAmountMinor: member.baseAmountMinor,
        discountMinor: quote.allocations[i].discountMinor, dueAmountMinor: quote.allocations[i].dueAmountMinor })) }
    if (!create) return { code: 200, body: preview }
    const now = new Date()
    if (!existing) {
      for (let i = 0; i < count; i++) {
        const person = input.people![i]
        const identity = normalizeIdentity({ name: members[i].name, email: person.email, phone: person.phone })
        const [created] = await tx.insert(registrations).values({ workshopId: workshop.id,isTest:!workshop.live_started_at,
          reference: randomBytes(12).toString('base64url'), creationKey: randomUUID(),
          accessTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
          name: members[i].name, normalizedName: identity.name, email: person.email.trim(),
          normalizedEmail: identity.email, phone: person.phone.trim(), normalizedPhone: identity.phone,
        }).returning({ id: registrations.id, reference: registrations.reference })
        members[i].registrationId = created.id; members[i].reference = created.reference
        await tx.insert(registrationIntakes).values({ registrationId: created.id,
          firstName: person.firstName.trim(), lastName: person.lastName.trim(), documentNumber: person.documentNumber, birthDate: person.birthDate,
          prayerGroup: person.prayerGroup?.trim() || null, movement: person.movement?.trim() || null,
          ecclesialState: person.ecclesialState, occupation: person.occupation?.trim() || null, paymentDifficulty: false })
        await tx.insert(reservations).values({ registrationId: created.id, expiresAt: new Date(workshop.starts_at) })
      }
    } else {
      for (const member of members) {
        await tx.update(paymentAttempts).set({ status: 'cancelled', updatedAt: now })
          .where(eq(paymentAttempts.id, member.oldAttemptId!))
        await tx.update(emailOutbox).set({ status: 'cancelled', lastErrorCode: 'replaced_by_group' })
          .where(and(eq(emailOutbox.registrationId, member.registrationId), eq(emailOutbox.kind, 'registration_received'),
            sql`${emailOutbox.status} IN ('queued','failed')`))
      }
    }
    const payer = members[existing ? members.findIndex(member => member.reference === input.payerReference) : input.payerIndex!]
    const [attempt] = await tx.insert(paymentAttempts).values({ registrationId: payer.registrationId,
      idempotencyKey: input.idempotencyKey!, groupRequestHash: hash, source: input.paymentMethod,
      status: 'created', amountMinor: quote.amountMinor, payerName: payer.name, payerEmail: payer.email,
    }).returning({ id: paymentAttempts.id })
    for (let i = 0; i < count; i++) {
      const allocation = quote.allocations[i]
      await tx.insert(paymentAllocations).values({ attemptId: attempt.id, registrationId: members[i].registrationId,
        lotId: allocation.lotId, lotNumber: allocation.lotNumber, promotionId: allocation.promotionId,
        promotionCode: allocation.promotionCode, baseAmountMinor: allocation.baseAmountMinor,
        discountMinor: allocation.discountMinor, dueAmountMinor: allocation.dueAmountMinor })
    }
    await tx.update(paymentAttempts).set({ status: 'pending', updatedAt: now }).where(eq(paymentAttempts.id, attempt.id))
    for (const member of members) await tx.insert(emailOutbox).values({
      dedupeKey: `group:${attempt.id}:${member.registrationId}`, kind: 'group_payment_notice',
      toEmail: member.email.trim().toLowerCase(), registrationId: member.registrationId, paymentAttemptId: attempt.id,
    })
    await tx.insert(auditLog).values({ actorId: input.operatorId!, action: 'payment.group_created', subjectId: attempt.id,
      changes: { mode: input.mode, memberCount: count, amountMinor: quote.amountMinor,
        promotionCode: promotion?.code ?? null, source: input.paymentMethod } })
    return { code: 201, body: { ...preview,
      members: preview.members.map((member, i) => ({ ...member, reference: members[i].reference })),
      attemptId: attempt.id, payerReference: payer.reference,
      references: members.map(member => member.reference), emailQueued: count, status: 'pending' } }
  })
}

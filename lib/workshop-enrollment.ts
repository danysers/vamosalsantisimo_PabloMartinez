import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, ne, or, sql } from 'drizzle-orm'
import { getDb } from './db'
import { assistanceWhatsappUrl, proofWhatsappUrl } from './email-templates'
import { normalizeIdentity } from './registration-policy'
import { checkoutAccessToken, hasCheckoutAccess, MP_FIXED_SURCHARGE_MINOR } from './checkout-access'
import { checkoutConfigured } from './mercado-pago-client'
import {
  assistanceRequests, emailOutbox, events, paymentAllocations, paymentAttempts,
  registrationIntakes, registrations, reservations, workshopLots,
  workshopPaymentSettings, workshops,
} from './schema'

export type EnrollmentInput = {
  firstName: string
  lastName: string
  nickname?: string
  resumeReceipts?: { reference: string; accessToken: string }[]
  birthDate: string
  phone: string
  email: string
  prayerGroup?: string
  movement?: string
  ecclesialState: 'laico' | 'religioso' | 'seminarista' | 'diacono' | 'postulante-novicia' | 'presbitero' | 'otro'
  occupation?: string
  paymentDifficulty: boolean
  paymentDifficultyNotes?: string
  paymentMethod?: 'bank_transfer' | 'on_site' | 'mercado_pago'
  creationKey: string
}

type Success = {
  reference: string
  status: 'pending' | 'waiting' | 'confirmed' | 'cancelled' | 'review'
  payment: 'assistance' | 'bank_transfer' | 'on_site' | 'mercado_pago'
  paymentStatus: 'requested' | 'pending' | 'approved' | 'declined' | 'refunded' | 'charged_back' | 'review'
  amountMinor: number | null
  baseAmountMinor?: number
  feeMinor?: number
  paymentAccessToken?: string
  transfer?: { alias: string; provider: string; whatsappUrl: string }
  assistanceWhatsappUrl?: string
  emailQueued: true
  resumed?: boolean
  requestedPayment?: 'bank_transfer' | 'on_site' | 'mercado_pago'
}
type Result = { code: number; body: Success | { error: string } }
const unavailable: Result = { code: 503, body: { error: 'Las inscripciones todavía no están habilitadas.' } }

function optional(value?: string) { return value?.trim() || null }

export async function enrollWorkshop(input: EnrollmentInput): Promise<Result> {
  const slug = process.env.WORKSHOP_EVENT_SLUG
  if (!slug) return unavailable
  const payment = input.paymentDifficulty ? 'assistance' : input.paymentMethod
  if (!payment || (input.paymentDifficulty && input.paymentMethod)) return { code: 400, body: { error: 'Elegí una forma de pago válida.' } }
  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`
  const identity = normalizeIdentity({ name: fullName, email: input.email, phone: input.phone })
  const db = getDb()
  return db.transaction(async tx => {
    const [target] = await tx.select({ id: workshops.id }).from(workshops)
      .innerJoin(events, eq(events.id, workshops.eventId)).where(eq(events.slug, slug)).limit(1)
    if (!target) return unavailable
    // All registration writers use the same workshop row lock for capacity and lot changes.
    await tx.execute(sql`SELECT id FROM ${workshops} WHERE ${workshops.id} = ${target.id} FOR UPDATE`)
    const [workshop] = await tx.select().from(workshops).where(eq(workshops.id, target.id)).limit(1)
    const [settings] = await tx.select().from(workshopPaymentSettings).where(eq(workshopPaymentSettings.workshopId, target.id)).limit(1)
    if (!workshop?.registrationOpen || !settings) return unavailable
    if (payment === 'mercado_pago' && (!settings.mercadoPagoEnabled || !checkoutConfigured())) return unavailable
    if (payment === 'bank_transfer' && (!settings.transferEnabled || !settings.transferAlias || !settings.transferProvider || !settings.proofWhatsappE164)) return unavailable
    if (payment === 'on_site' && !settings.onSiteEnabled) return unavailable
    if (payment === 'assistance' && (!settings.reminderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.reminderEmail) || !settings.proofWhatsappE164)) return unavailable
    const [lot] = await tx.select().from(workshopLots).where(and(eq(workshopLots.workshopId, target.id), eq(workshopLots.number, workshop.activeLot))).limit(1)
    if (!lot) return unavailable

    const response = (reference: string, amountMinor: number | null, registrationStatus: Success['status'], paymentStatus: Success['paymentStatus'], registrationId?: string, feeMinor = MP_FIXED_SURCHARGE_MINOR): Success => ({
      reference, status: registrationStatus, payment, paymentStatus, amountMinor,
      ...(payment !== 'assistance' && registrationId ? { paymentAccessToken: checkoutAccessToken(registrationId, input.creationKey) } : {}),
      ...(payment === 'mercado_pago' && registrationId ? {
        baseAmountMinor: amountMinor! - feeMinor, feeMinor,
      } : {}),
      ...(payment === 'bank_transfer' ? { transfer: {
        alias: settings.transferAlias!, provider: settings.transferProvider!,
        whatsappUrl: proofWhatsappUrl(settings.proofWhatsappE164!, reference),
      } } : {}),
      ...(payment === 'assistance' ? { assistanceWhatsappUrl: assistanceWhatsappUrl(settings.proofWhatsappE164!, reference) } : {}),
      emailQueued: true,
    })
    const [replay] = await tx.select().from(registrations).where(eq(registrations.creationKey, input.creationKey)).limit(1)
    if (replay) {
      const [intake] = await tx.select().from(registrationIntakes).where(eq(registrationIntakes.registrationId, replay.id)).limit(1)
      const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.registrationId, replay.id)).orderBy(sql`${paymentAttempts.createdAt} DESC`).limit(1)
      const [assistance] = await tx.select().from(assistanceRequests).where(eq(assistanceRequests.registrationId, replay.id)).limit(1)
      if (replay.workshopId !== target.id || replay.normalizedName !== identity.name || replay.normalizedEmail !== identity.email ||
          replay.normalizedPhone !== identity.phone || intake?.birthDate !== input.birthDate ||
          intake?.ecclesialState !== input.ecclesialState || intake?.paymentDifficulty !== input.paymentDifficulty ||
          optional(intake?.prayerGroup ?? undefined) !== optional(input.prayerGroup) ||
          optional(intake?.movement ?? undefined) !== optional(input.movement) ||
          optional(intake?.occupation ?? undefined) !== optional(input.occupation) ||
          optional(intake?.nickname ?? undefined) !== optional(input.nickname) ||
          optional(intake?.paymentDifficultyNotes ?? undefined) !== optional(input.paymentDifficultyNotes) ||
          (payment !== 'assistance' && attempt?.source !== payment) || (payment === 'assistance' && attempt)) {
        return { code: 409, body: { error: 'Esta solicitud ya fue usada con otros datos.' } }
      }
      const currentState = payment === 'assistance' ? (assistance?.status ?? 'requested') : attempt?.status
      const paymentStatus = currentState === 'created' ? 'pending' : currentState === 'cancelled' || currentState === 'rejected' || currentState === 'partially_refunded' ? 'review' : currentState
      return { code: 200, body: response(replay.reference, attempt?.amountMinor ?? null, replay.status, paymentStatus as Success['paymentStatus'], replay.id, attempt?.providerFeeMinor ?? 0) }
    }
    const conflicts = await tx.select().from(registrations).where(and(
      eq(registrations.workshopId, target.id), ne(registrations.status, 'cancelled'),
      eq(registrations.normalizedName, identity.name),
      or(eq(registrations.normalizedEmail, identity.email), eq(registrations.normalizedPhone, identity.phone)),
    )).limit(1)
    if (conflicts.length) {
      const existing = conflicts[0]
      const proof = input.resumeReceipts?.find(receipt => receipt.reference === existing.reference &&
        hasCheckoutAccess(receipt.accessToken, existing.id, existing.creationKey))
      if (!proof) return { code: 409, body: { error: 'Ya recibimos una inscripción con estos datos. Revisá tu correo o abrí la confirmación en el navegador donde te inscribiste.' } }
      const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.registrationId, existing.id)).orderBy(sql`${paymentAttempts.createdAt} DESC`).limit(1)
      if (!attempt || !['mercado_pago','bank_transfer','on_site'].includes(attempt.source)) return { code: 409, body: { error: 'Tu inscripción requiere una revisión de la organización.' } }
      if (input.nickname !== undefined) await tx.update(registrationIntakes).set({ nickname: optional(input.nickname), updatedAt: new Date() }).where(eq(registrationIntakes.registrationId, existing.id))
      return { code: 200, body: {
        reference: existing.reference, status: existing.status, payment: attempt.source as Success['payment'], paymentStatus: attempt.status === 'created' ? 'pending' : attempt.status as Success['paymentStatus'],
        amountMinor: attempt.amountMinor, baseAmountMinor: attempt.amountMinor-attempt.providerFeeMinor, feeMinor: attempt.providerFeeMinor,
        paymentAccessToken: proof.accessToken, emailQueued: true, resumed: true,
        ...(payment !== 'assistance' ? { requestedPayment: payment } : {}),
        ...(attempt.source === 'bank_transfer' ? { transfer: { alias: settings.transferAlias!, provider: settings.transferProvider!, whatsappUrl: proofWhatsappUrl(settings.proofWhatsappE164!, existing.reference) } } : {}),
      } }
    }
    if (workshop.capacity !== null) {
      const occupied = await tx.execute(sql`
        SELECT count(*)::int AS count FROM ${reservations} h JOIN ${registrations} r ON r.id=h.registration_id
        WHERE r.workshop_id=${target.id} AND (h.status='used' OR (h.status='held' AND h.expires_at>now()))
      `)
      if (Number(occupied.rows[0]?.count) >= workshop.capacity) return { code: 409, body: { error: 'El taller está completo.' } }
    }
    const reference = randomBytes(12).toString('base64url')
    const [created] = await tx.insert(registrations).values({
      workshopId: target.id, reference, creationKey: input.creationKey,
      accessTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      name: fullName, normalizedName: identity.name,
      email: input.email.trim(), normalizedEmail: identity.email,
      phone: input.phone.trim(), normalizedPhone: identity.phone,
    }).returning({ id: registrations.id })
    await tx.insert(registrationIntakes).values({
      registrationId: created.id, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      birthDate: input.birthDate, prayerGroup: optional(input.prayerGroup), movement: optional(input.movement),
      nickname: optional(input.nickname),
      ecclesialState: input.ecclesialState, occupation: optional(input.occupation),
      paymentDifficulty: input.paymentDifficulty,
      paymentDifficultyNotes: input.paymentDifficulty ? optional(input.paymentDifficultyNotes) : null,
    })
    await tx.insert(reservations).values({
      registrationId: created.id,
      // Offline/assistance requests remain reviewable until the event; no 30-minute checkout expiry.
      expiresAt: payment === 'mercado_pago' ? new Date(Math.min(Date.now() + 30 * 60_000, workshop.startsAt.getTime())) : workshop.startsAt,
    })
    if (payment === 'assistance') {
      await tx.insert(assistanceRequests).values({ registrationId: created.id })
    } else {
      const amountMinor = lot.amountMinor + (payment === 'mercado_pago' ? MP_FIXED_SURCHARGE_MINOR : 0)
      const [attempt] = await tx.insert(paymentAttempts).values({
        registrationId: created.id, source: payment, status: 'created',
        idempotencyKey: randomUUID(), amountMinor,
        externalReference: payment === 'mercado_pago' ? randomUUID() : null,
        providerFeeMinor: payment === 'mercado_pago' ? MP_FIXED_SURCHARGE_MINOR : 0,
        payerName: fullName, payerEmail: input.email.trim(),
      }).returning({ id: paymentAttempts.id })
      await tx.insert(paymentAllocations).values({
        attemptId: attempt.id, registrationId: created.id, lotId: lot.id,
        lotNumber: lot.number, baseAmountMinor: lot.amountMinor,
        discountMinor: 0, dueAmountMinor: lot.amountMinor,
      })
      await tx.update(paymentAttempts).set({ status: 'pending' }).where(eq(paymentAttempts.id, attempt.id))
    }
    // In the same transaction: no confirmation without a persisted registration,
    // and no successful registration without a durable, deduplicated email job.
    await tx.insert(emailOutbox).values({
      dedupeKey: `registration:${created.id}:received`, kind: 'registration_received',
      toEmail: identity.email, registrationId: created.id,
    })
    if (payment === 'assistance') {
      await tx.insert(emailOutbox).values({
        dedupeKey: `assistance:${created.id}:review-request`, kind: 'assistance_review_request',
        toEmail: settings.reminderEmail!.trim().toLowerCase(), registrationId: created.id,
      })
    }
    return { code: 201, body: response(reference, payment === 'assistance' ? null : lot.amountMinor + (payment === 'mercado_pago' ? MP_FIXED_SURCHARGE_MINOR : 0), 'pending', payment === 'assistance' ? 'requested' : 'pending', created.id) }
  })
}

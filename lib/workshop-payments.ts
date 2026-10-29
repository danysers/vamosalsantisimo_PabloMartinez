import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from './db'
import { hasCheckoutAccess, localWorkshopTestMode } from './checkout-access'
import { createCheckoutProOrder, fetchCheckoutProOrder, cancelCheckoutProOrder, checkoutConfigured, mercadoPagoConfig, assertOrderEnvironment } from './mercado-pago-client'
import { inspectUnpaidCheckoutOrder } from './checkout-method-contract'
import { proofWhatsappUrl } from './email-templates'
import { organizationWhatsApp } from './whatsapp-link'
import { projectMercadoPagoOrder } from './mercado-pago-reconciliation'
import { issueAccreditationAfterApproval } from './accreditation-workflow'
import { decryptAccreditationQr, hashAccreditationQr } from './accreditation-token'
import { createRegistrationQr } from './registration-qr'
import QRCode from 'qrcode'
import { accreditationCredentials, auditLog, emailOutbox, paymentAllocations, paymentAttempts, paymentTransactions, paymentRefunds, paymentChargebacks, registrations, reservations, webhookEvents, workshopLots, workshopPaymentSettings } from './schema'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Access = { reference: string; accessToken: string }
type Attempt = {
  id: string; registration_id: string; workshop_id: string; reference: string; creation_key: string;
  source: string; status: string; registration_status: string; amount_minor: number | null; provider_fee_minor: number;
  payer_email: string; external_reference: string; idempotency_key: string; provider_order_id: string | null;
  checkout_url: string | null; reconciled_at: Date | null; expires_at: Date | null;
  paid_amount_minor: number; payer_name: string | null;
  historical: boolean;
}

async function authorizedAttempt(db: Db | Tx, access: Access, lock = false): Promise<Attempt> {
  const result = await db.execute(sql`
    SELECT p.*,r.id AS registration_id,r.workshop_id,r.reference,r.creation_key,r.status AS registration_status,h.expires_at,
      NOT registration_is_current(r.id) AS historical
    FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id
    JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    LEFT JOIN reservations h ON h.registration_id=r.id
    WHERE r.reference=${access.reference} AND e.slug=${process.env.WORKSHOP_EVENT_SLUG || ''}
    ORDER BY p.created_at DESC LIMIT 1 ${lock ? sql`FOR UPDATE OF p,r` : sql``}
  `)
  const row = result.rows[0] as unknown as Attempt | undefined
  if (!row || !hasCheckoutAccess(access.accessToken, row.registration_id, row.creation_key)) throw new Error('Payment access denied')
  return row
}

export async function startWorkshopCheckout(access: Access, createOrder = createCheckoutProOrder) {
  mercadoPagoConfig()
  return getDb().transaction(async tx => {
    const attempt = await authorizedAttempt(tx, access, true)
    if (attempt.historical) throw new Error('Historical enrollment cannot create a live checkout')
    if (attempt.source !== 'mercado_pago' || attempt.amount_minor === null || attempt.status !== 'pending' || attempt.registration_status !== 'pending') throw new Error('Payment is not pending')
    if (!attempt.expires_at || new Date(attempt.expires_at).getTime() <= Date.now()) throw new Error('Checkout reservation expired')
    if (attempt.checkout_url) return { checkoutUrl: attempt.checkout_url, amountMinor: attempt.amount_minor }
    const origin = process.env.MP_PUBLIC_ORIGIN || process.env.SITE_ORIGIN
    const publicOrigin = origin ? new URL(origin) : null
    // HTTP loopback is used only for local development. Do not give Mercado Pago
    // a return address that its servers cannot reach; the original tab retains
    // the authenticated status screen when no HTTPS return origin is set.
    const returnUrl = publicOrigin?.protocol === 'https:'
      ? `${publicOrigin.origin}/formacion/pago?reference=${encodeURIComponent(attempt.reference)}` : undefined
    const order = await createOrder({ reference: attempt.external_reference, email: attempt.payer_email, amountMinor: attempt.amount_minor, ...(returnUrl ? { returnUrl } : {}) }, attempt.idempotency_key)
    await tx.update(paymentAttempts).set({ providerOrderId: order.id, checkoutUrl: order.checkoutUrl, checkoutCreatedAt: new Date(), updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id))
    await tx.insert(auditLog).values({ action: 'payment.checkout_created', subjectId: attempt.id,
      changes: { orderId: order.id, amountMinor: attempt.amount_minor, providerFeeMinor: attempt.provider_fee_minor } })
    return { checkoutUrl: order.checkoutUrl, amountMinor: attempt.amount_minor }
  })
}

export async function reconcileWorkshopOrder(orderId: string, loadOrder = fetchCheckoutProOrder) {
  const config = mercadoPagoConfig(false)
  assertOrderEnvironment(orderId, config.liveMode)
  const raw = await loadOrder(orderId)
  const data = raw as { external_reference?: unknown; live_mode?: unknown }
  if (typeof data?.external_reference !== 'string' || (typeof data.live_mode === 'boolean' && data.live_mode !== config.liveMode)) throw new Error('Unexpected provider order')
  const db = getDb()
  return db.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT p.id,r.workshop_id FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE p.external_reference=${data.external_reference as string} AND p.source='mercado_pago'
        AND registration_is_current(r.id)
        AND e.slug=${process.env.WORKSHOP_EVENT_SLUG || ''} LIMIT 1
    `)
    if (!found.rows[0]) throw new Error('Unknown provider order')
    const workshopId = String(found.rows[0].workshop_id)
    await tx.execute(sql`SELECT id FROM workshops WHERE id=${workshopId} FOR UPDATE`)
    const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, String(found.rows[0].id))).for('update')
    if (!attempt || attempt.amountMinor === null || (attempt.providerOrderId && attempt.providerOrderId !== orderId)) throw new Error('Mismatched provider order')
    const projection = projectMercadoPagoOrder(raw, { orderId, externalReference: attempt.externalReference!, amountMinor: attempt.amountMinor, sellerUserId: config.sellerUserId, applicationId: config.applicationId })
    if (attempt.providerUpdatedAt && projection.providerUpdatedAt && new Date(projection.providerUpdatedAt).getTime() < attempt.providerUpdatedAt.getTime()) return { status: attempt.status }
    const now = new Date()
    for (const payment of projection.payments) {
      const saved = await tx.insert(paymentTransactions).values({ attemptId: attempt.id, ...payment }).onConflictDoUpdate({
        target: paymentTransactions.providerPaymentId, set: { ...payment, updatedAt: now }, setWhere: eq(paymentTransactions.attemptId, attempt.id),
      }).returning({ id: paymentTransactions.id })
      if (!saved.length) throw new Error('Payment already belongs to another attempt')
    }
    for (const refund of projection.refunds) {
      const saved = await tx.insert(paymentRefunds).values({ attemptId: attempt.id, ...refund }).onConflictDoUpdate({
        target: paymentRefunds.providerRefundId, set: { ...refund, updatedAt: now }, setWhere: eq(paymentRefunds.attemptId, attempt.id),
      }).returning({ id: paymentRefunds.id })
      if (!saved.length) throw new Error('Refund already belongs to another attempt')
    }
    for (const chargeback of projection.chargebacks) {
      // Provider chargeback ids are indexed by attempt; serialize on the attempt
      // lock to retain one current projection without duplicating retries.
      const [existing] = await tx.select({ id: paymentChargebacks.id }).from(paymentChargebacks).where(and(eq(paymentChargebacks.attemptId, attempt.id), eq(paymentChargebacks.providerChargebackId, chargeback.providerChargebackId))).limit(1)
      if (existing) await tx.update(paymentChargebacks).set({ ...chargeback, updatedAt: now }).where(eq(paymentChargebacks.id, existing.id))
      else await tx.insert(paymentChargebacks).values({ attemptId: attempt.id, ...chargeback })
    }
    let status: typeof paymentAttempts.$inferInsert.status = 'pending'
    if (projection.decision === 'approved') status = 'approved'
    else if (projection.chargebacks.length) status = 'charged_back'
    else if (projection.refunds.length) status = projection.refunds.reduce((sum, row) => sum + row.amountMinor, 0) >= attempt.amountMinor ? 'refunded' : 'partially_refunded'
    else if (projection.providerStatus === 'canceled' || projection.providerStatus === 'cancelled') status = 'cancelled'
    else if (['failed', 'rejected', 'expired'].includes(projection.providerStatus)) status = 'rejected'
    else if (!['created', 'processing', 'action_required'].includes(projection.providerStatus)) status = 'review'
    // Never downgrade a confirmed payment because an older/pending projection
    // arrives out of order. A verified refund/chargeback still takes precedence.
    if (attempt.status === 'approved' && status === 'pending') return { status: attempt.status }
    if (attempt.status === 'cancelled' && status === 'pending') return { status: attempt.status }
    if (['refunded', 'partially_refunded', 'charged_back'].includes(attempt.status) && ['pending', 'approved'].includes(status!)) return { status: attempt.status }
    await tx.update(paymentAttempts).set({ status, providerOrderId: orderId, ...{
      paidAmountMinor: projection.paidAmountMinor, providerStatus: projection.providerStatus,
      providerStatusDetail: projection.providerStatusDetail, providerUserId: projection.providerUserId,
      providerApplicationId: projection.providerApplicationId, providerLiveMode: config.liveMode,
      providerUpdatedAt: projection.providerUpdatedAt ? new Date(projection.providerUpdatedAt) : now,
      reconciledAt: now, updatedAt: now,
    } }).where(eq(paymentAttempts.id, attempt.id))
    const members = await tx.execute(sql`SELECT r.id,r.status,r.email,r.reference FROM registrations r
      JOIN payment_allocations a ON a.registration_id=r.id WHERE a.attempt_id=${attempt.id} ORDER BY r.id FOR UPDATE OF r`)
    if (status === 'approved') {
      for (const member of members.rows) {
        if (!['pending', 'confirmed'].includes(String(member.status))) continue
        const seat = await tx.execute(sql`SELECT status,expires_at FROM reservations WHERE registration_id=${String(member.id)} FOR UPDATE`)
        const held = seat.rows[0]
        if (held?.status !== 'used' && (!held || held.status !== 'held' || new Date(String(held.expires_at)).getTime() <= now.getTime())) {
          const availability = await tx.execute(sql`SELECT w.capacity,
            (SELECT count(*)::integer FROM reservations h JOIN registrations r ON r.id=h.registration_id
             WHERE r.workshop_id=w.id AND registration_is_current(r.id) AND r.id<>${String(member.id)} AND (h.status='used' OR (h.status='held' AND h.expires_at>now()))) AS occupied
            FROM workshops w WHERE w.id=${workshopId}`)
          const capacity = availability.rows[0]?.capacity
          if (capacity != null && Number(availability.rows[0].occupied) >= Number(capacity)) {
            await tx.update(registrations).set({ status: 'review', updatedAt: now }).where(eq(registrations.id, String(member.id)))
            await tx.insert(auditLog).values({ action: 'payment.late_capacity_review', subjectId: String(member.id), changes: { attemptId: attempt.id } })
            continue
          }
        }
        const issued = await issueAccreditationAfterApproval(tx, { registrationId: String(member.id), eventSlug: process.env.WORKSHOP_EVENT_SLUG!, operatorId: null })
        if (issued.code !== 200 && issued.code !== 201) throw new Error('Payment accreditation unavailable')
        await tx.update(reservations).set({ status: 'used' }).where(eq(reservations.registrationId, String(member.id)))
      }
    } else if (['refunded', 'partially_refunded', 'charged_back', 'review'].includes(status!)) {
      for (const member of members.rows) {
        await tx.update(accreditationCredentials).set({ revokedAt: now, revocationReason: 'payment_reversed_or_review' }).where(and(eq(accreditationCredentials.registrationId, String(member.id)), isNull(accreditationCredentials.revokedAt)))
        await tx.update(registrations).set({ status: 'review', updatedAt: now }).where(eq(registrations.id, String(member.id)))
      }
    }
    if (attempt.status !== status) await tx.insert(auditLog).values({ action: 'payment.provider_reconciled', subjectId: attempt.id,
      changes: { from: attempt.status, to: status, orderId, amountMinor: attempt.amountMinor } })
    return { status }
  })
}

export async function workshopPaymentStatus(access: Access, refresh = true) {
  let attempt = await authorizedAttempt(getDb(), access)
  let verification: 'verified' | 'pending' | 'unavailable' = 'pending'
  if (!attempt.historical && refresh && attempt.source === 'mercado_pago' && attempt.provider_order_id && (!attempt.reconciled_at || Date.now() - new Date(attempt.reconciled_at).getTime() > 10_000)) {
    try { await reconcileWorkshopOrder(attempt.provider_order_id); verification = 'verified' } catch { verification = 'unavailable' }
    attempt = await authorizedAttempt(getDb(), access)
  }
  const delivery = await getDb().execute(sql`SELECT status FROM email_outbox WHERE registration_id=${attempt.registration_id}
    AND kind='accreditation_ready' ORDER BY created_at DESC LIMIT 1`)
  const proof = await getDb().execute(sql`SELECT uploaded_at FROM payment_proofs WHERE payment_attempt_id=${attempt.id} ORDER BY uploaded_at DESC LIMIT 1`)
  const [settings] = await getDb().select().from(workshopPaymentSettings).where(eq(workshopPaymentSettings.workshopId, attempt.workshop_id)).limit(1)
  const eligibility = await getDb().execute(sql`SELECT
    (SELECT count(*)::int FROM payment_allocations WHERE attempt_id=${attempt.id}) AS members,
    EXISTS(SELECT 1 FROM payment_allocations a JOIN payment_attempts p ON p.id=a.attempt_id
      WHERE a.registration_id=${attempt.registration_id} AND p.id<>${attempt.id} AND p.status IN ('created','pending','approved')) AS other_active`)
  const profile = await getDb().execute(sql`SELECT i.nickname,w.starts_at FROM registration_intakes i
    JOIN registrations r ON r.id=i.registration_id JOIN workshops w ON w.id=r.workshop_id WHERE r.id=${attempt.registration_id}`)
  const startsAt = profile.rows[0]?.starts_at
  const registrationCard = attempt.source === 'on_site' && attempt.status === 'pending' && attempt.registration_status === 'pending' &&
    startsAt && new Date(String(startsAt)).getTime()+86_400_000 > Date.now() ? {
      qrDataUrl: await QRCode.toDataURL(createRegistrationQr(attempt.registration_id, attempt.reference, attempt.creation_key), { width: 480, margin: 2, errorCorrectionLevel: 'M' }),
      startsAt: new Date(String(startsAt)).toISOString(), venue: 'Parroquia San Luis de Francia',
    } : null
  // Reuse the credential delivered by email. A status read never issues a QR.
  let accreditation: { qrDataUrl: string; startsAt: string; venue: string } | null = null
  if (attempt.status === 'approved' && attempt.registration_status === 'confirmed') {
    const credentials = await getDb().execute(sql`
      SELECT c.*,w.starts_at FROM accreditation_credentials c
      JOIN registrations r ON r.id=c.registration_id JOIN workshops w ON w.id=r.workshop_id
      WHERE r.id=${attempt.registration_id} AND r.status='confirmed'
        AND registration_has_approved_payment(r.id)
        AND c.revoked_at IS NULL AND c.expires_at>now()
      ORDER BY c.version DESC LIMIT 1`)
    const credential = credentials.rows[0]
    if (credential && process.env.ACCREDITATION_TOKEN_KEY &&
        credential.encryption_key_id === process.env.ACCREDITATION_TOKEN_KEY_ID) {
      try {
        const value = decryptAccreditationQr({ tokenCiphertext: String(credential.token_ciphertext),
          tokenIv: String(credential.token_iv), tokenAuthTag: String(credential.token_auth_tag) },
        process.env.ACCREDITATION_TOKEN_KEY, attempt.registration_id, Number(credential.version))
        if (hashAccreditationQr(value) !== credential.token_hash) throw new Error('Invalid credential')
        accreditation = {
          qrDataUrl: await QRCode.toDataURL(value, { width: 480, margin: 2, errorCorrectionLevel: 'M' }),
          startsAt: new Date(String(credential.starts_at)).toISOString(), venue: 'Parroquia San Luis de Francia',
        }
      } catch { console.error('Workshop accreditation could not be rendered') }
    }
  }
  return { reference: attempt.reference, status: attempt.status, registrationStatus: attempt.registration_status,
    attemptId: attempt.id, paymentMethod: attempt.source, proofSubmitted: !!proof.rows[0],
    canChangeMethod: !attempt.historical && !proof.rows[0] && ['mercado_pago','bank_transfer','on_site'].includes(attempt.source) && attempt.registration_status === 'pending' && ['pending','created','rejected','cancelled'].includes(attempt.status) &&
      Number(eligibility.rows[0]?.members) === 1 && !eligibility.rows[0]?.other_active && attempt.paid_amount_minor === 0,
    onlineCheckoutReady: !!settings?.mercadoPagoEnabled && checkoutConfigured(),
    methods: { mercado_pago: !!settings && ((settings.mercadoPagoEnabled && checkoutConfigured()) || localWorkshopTestMode(process.env.SITE_ORIGIN ?? '')),
      bank_transfer: !!(settings?.transferEnabled && settings.transferAlias && settings.transferProvider && settings.proofWhatsappE164), on_site: !!settings?.onSiteEnabled },
    transfer: attempt.source === 'bank_transfer' && settings?.transferAlias && settings.transferProvider && settings.proofWhatsappE164 ? {
      alias: settings.transferAlias, provider: settings.transferProvider,
      holder: settings.transferHolder, document: settings.transferDocument,
      whatsappUrl: proofWhatsappUrl(settings.proofWhatsappE164, attempt.reference),
    } : null,
    amountMinor: attempt.amount_minor, feeMinor: attempt.provider_fee_minor, baseAmountMinor: attempt.amount_minor === null ? null : attempt.amount_minor - attempt.provider_fee_minor,
    emailStatus: delivery.rows[0]?.status ?? 'not_ready', accreditation, registrationCard,
    supportWhatsappUrl: proofWhatsappUrl(organizationWhatsApp,attempt.reference),
    nickname: typeof profile.rows[0]?.nickname === 'string' ? profile.rows[0].nickname : null,
    historical: attempt.historical,
    testMode: attempt.historical || process.env.MP_ENVIRONMENT === 'test',
    verification, checkoutUrl: !attempt.historical && attempt.status === 'pending' && attempt.registration_status === 'pending' ? attempt.checkout_url : null }
}

export class PaymentMethodChangeError extends Error {}

export async function changeWorkshopPaymentMethod(
  input: Access & { attemptId: string; method: 'mercado_pago' | 'bank_transfer' | 'on_site' },
  provider = { load: fetchCheckoutProOrder, cancel: cancelCheckoutProOrder },
) {
  if (!['mercado_pago', 'bank_transfer', 'on_site'].includes(input.method)) throw new PaymentMethodChangeError('Elegí una forma de pago válida.')
  const db = getDb()
  const initial = await authorizedAttempt(db, input)
  if (initial.historical) throw new PaymentMethodChangeError('Este registro del ensayo anterior se conserva solo para consulta.')
  await db.transaction(async tx => {
    const workshopResult = await tx.execute(sql`SELECT id,registration_open,capacity,starts_at FROM workshops WHERE id=${initial.workshop_id} FOR UPDATE`)
    const workshop = workshopResult.rows[0]
    const attempt = await authorizedAttempt(tx, input, true)
    if (!['mercado_pago','bank_transfer','on_site'].includes(attempt.source) || attempt.registration_status !== 'pending' || !['pending','created','rejected','cancelled'].includes(attempt.status) || attempt.paid_amount_minor !== 0) {
      throw new PaymentMethodChangeError('El pago ya fue confirmado o requiere revisión. No hace falta volver a pagar.')
    }
    const uploadedProof = await tx.execute(sql`SELECT 1 FROM payment_proofs WHERE payment_attempt_id=${attempt.id} LIMIT 1`)
    if (uploadedProof.rows.length) throw new PaymentMethodChangeError('El comprobante está en revisión. Contactá a la organización para cambiar el pago.')
    // A retried save must not create another attempt or undo a newer choice.
    if (attempt.id !== input.attemptId) {
      if (attempt.source === input.method) return
      throw new PaymentMethodChangeError('La forma de pago cambió. Volvé a abrir el selector.')
    }
    if (attempt.source === input.method) return
    if (!workshop?.registration_open || new Date(String(workshop.starts_at)).getTime() <= Date.now()) throw new PaymentMethodChangeError('No es posible cambiar el medio de pago en este momento.')
    const [settings] = await tx.select().from(workshopPaymentSettings).where(eq(workshopPaymentSettings.workshopId, attempt.workshop_id)).limit(1)
    if (!settings || (input.method === 'mercado_pago' && !((settings.mercadoPagoEnabled && checkoutConfigured()) || localWorkshopTestMode(process.env.SITE_ORIGIN ?? ''))) ||
        (input.method === 'bank_transfer' && (!settings.transferEnabled || !settings.transferAlias || !settings.transferProvider || !settings.proofWhatsappE164)) ||
        (input.method === 'on_site' && !settings.onSiteEnabled)) throw new PaymentMethodChangeError('Ese medio de pago no está disponible.')
    const allocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.attemptId, attempt.id))
    const allocation = allocations[0]
    const other = await tx.execute(sql`SELECT 1 FROM payment_allocations a JOIN payment_attempts p ON p.id=a.attempt_id
      WHERE a.registration_id=${attempt.registration_id} AND p.id<>${attempt.id} AND p.status IN ('created','pending','approved') LIMIT 1`)
    if (allocations.length !== 1 || allocation.registrationId !== attempt.registration_id || other.rows.length) {
      throw new PaymentMethodChangeError('Esta inscripción tiene un pago grupal o en revisión. Contactá a la organización.')
    }
    const occupied = await tx.execute(sql`SELECT count(*)::int AS n FROM reservations h JOIN registrations r ON r.id=h.registration_id
      WHERE r.workshop_id=${attempt.workshop_id} AND r.id<>${attempt.registration_id} AND (h.status='used' OR (h.status='held' AND h.expires_at>now()))`)
    if (workshop.capacity !== null && Number(occupied.rows[0]?.n) >= Number(workshop.capacity)) throw new PaymentMethodChangeError('El taller está completo. Contactá a la organización.')
    let canceledAt: Date | undefined
    if (attempt.source === 'mercado_pago' && attempt.provider_order_id) {
      if (attempt.amount_minor === null) throw new PaymentMethodChangeError('El pago online no tiene un importe válido.')
      const config = mercadoPagoConfig(false)
      const expected = { orderId: attempt.provider_order_id, externalReference: attempt.external_reference!, amountMinor: attempt.amount_minor,
        sellerUserId: config.sellerUserId!, applicationId: config.applicationId!, liveMode: config.liveMode }
      assertOrderEnvironment(attempt.provider_order_id, config.liveMode)
      try {
        let state = inspectUnpaidCheckoutOrder(await provider.load(attempt.provider_order_id), expected)
        if (!state.canceled) {
          const hash = createHash('sha256').update('cancel-checkout:'+attempt.id).digest('hex')
          const key = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`
          await provider.cancel(attempt.provider_order_id, key)
          state = inspectUnpaidCheckoutOrder(await provider.load(attempt.provider_order_id), expected)
        }
        if (!state.canceled) throw new Error('Cancellation not confirmed')
        canceledAt = state.updatedAt
      } catch { throw new PaymentMethodChangeError('No pudimos cerrar el pago anterior. Puede estar procesándose; esperá la confirmación antes de cambiar de método.') }
    }
    const now = new Date()
    await tx.update(paymentAttempts).set({ status: 'cancelled', updatedAt: now,
      ...(canceledAt ? { providerStatus: 'canceled', providerStatusDetail: 'canceled_transaction', providerUpdatedAt: canceledAt, reconciledAt: now } : {}),
    }).where(eq(paymentAttempts.id, attempt.id))
    const fee = input.method === 'mercado_pago' ? settings.onlineServiceFeeMinor : 0
    const [lot] = await tx.select({ amountMinor: workshopLots.amountMinor }).from(workshopLots).where(eq(workshopLots.id, allocation.lotId)).limit(1)
    if (!lot) throw new PaymentMethodChangeError('No encontramos el precio del lote de tu inscripción.')
    const baseAmount = input.method === 'on_site' ? settings.onSitePriceMinor
      : attempt.source === 'on_site' ? lot.amountMinor : allocation.dueAmountMinor
    if (input.method !== 'on_site' && baseAmount === null) throw new PaymentMethodChangeError('No pudimos calcular el importe. Contactá a la organización.')
    const [replacement] = await tx.insert(paymentAttempts).values({ registrationId: attempt.registration_id, replacesAttemptId: attempt.id, source: input.method,
      status: 'created', amountMinor: baseAmount === null ? null : baseAmount+fee, providerFeeMinor: fee, idempotencyKey: randomUUID(),
      externalReference: input.method === 'mercado_pago' ? randomUUID() : null, payerName: attempt.payer_name, payerEmail: attempt.payer_email,
    }).returning({ id: paymentAttempts.id })
    await tx.insert(paymentAllocations).values({ attemptId: replacement.id, registrationId: allocation.registrationId,
      lotId: allocation.lotId, lotNumber: allocation.lotNumber, promotionId: allocation.promotionId, promotionCode: allocation.promotionCode,
      baseAmountMinor: baseAmount, discountMinor: 0, dueAmountMinor: baseAmount })
    await tx.update(paymentAttempts).set({ status: 'pending' }).where(eq(paymentAttempts.id, replacement.id))
    await tx.update(reservations).set({ expiresAt: input.method === 'mercado_pago'
      ? new Date(Math.min(Date.now()+30*60_000, new Date(String(workshop.starts_at)).getTime())) : new Date(String(workshop.starts_at)) })
      .where(eq(reservations.registrationId, attempt.registration_id))
    await tx.update(emailOutbox).set({ status: 'cancelled', lastErrorCode: 'payment_method_changed' })
      .where(and(eq(emailOutbox.registrationId, attempt.registration_id), sql`${emailOutbox.kind} IN ('registration_received','payment_instructions')`, sql`${emailOutbox.status} IN ('queued','failed')`))
    await tx.insert(emailOutbox).values({ dedupeKey: `payment:${replacement.id}:instructions`, kind: 'payment_instructions',
      registrationId: attempt.registration_id, paymentAttemptId: replacement.id, toEmail: attempt.payer_email })
    await tx.insert(auditLog).values({ action: 'payment.method_changed', subjectId: attempt.registration_id,
      changes: { from: attempt.source, to: input.method, previousAttemptId: attempt.id, attemptId: replacement.id } })
  })
  return workshopPaymentStatus(input, false)
}

export async function persistMercadoPagoNotification(input: { eventId: string; orderId: string; action: string; requestId: string; applicationId: string; sellerUserId: string; liveMode: boolean }, loadOrder = fetchCheckoutProOrder) {
  const db = getDb()
  const dedupe = `orders:${input.applicationId}:${input.eventId}`
  await db.insert(webhookEvents).values({ providerEventId: dedupe, resourceId: input.orderId, topic: 'order',
    action: input.action, applicationId: input.applicationId, sellerUserId: input.sellerUserId, liveMode: input.liveMode, requestId: input.requestId,
    payload: { id: input.eventId, orderId: input.orderId, action: input.action },
  }).onConflictDoNothing({ target: webhookEvents.providerEventId })
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.providerEventId, dedupe)).limit(1)
  if (!event || event.resourceId !== input.orderId) throw new Error('Mismatched notification')
  if (event.processedAt) return
  try {
    await reconcileWorkshopOrder(input.orderId, loadOrder)
    await db.update(webhookEvents).set({ processedAt: new Date(), lastTriedAt: new Date(), errorCode: null }).where(eq(webhookEvents.id, event.id))
  } catch {
    await db.update(webhookEvents).set({ retryCount: sql`${webhookEvents.retryCount} + 1`, lastTriedAt: new Date(), errorCode: 'reconciliation_unavailable' }).where(eq(webhookEvents.id, event.id))
    throw new Error('Payment reconciliation unavailable')
  }
}

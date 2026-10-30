import { sql } from 'drizzle-orm'
import { boolean, check, customType, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user as authUser } from './auth-schema'

export const registrationStatus = pgEnum('registration_status', ['pending', 'waiting', 'confirmed', 'cancelled', 'review'])
export const reservationStatus = pgEnum('reservation_status', ['held', 'expired', 'released', 'used'])
export const paymentStatus = pgEnum('payment_status', ['created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'review', 'partially_refunded'])
export const paymentSource = pgEnum('payment_source', ['mercado_pago', 'manual', 'bank_transfer', 'on_site'])
export const adminRole = pgEnum('admin_role', ['configuration', 'registration_operator', 'admission_operator'])
export const ecclesialState = pgEnum('ecclesial_state', ['laico', 'religioso', 'seminarista', 'diacono', 'postulante-novicia', 'presbitero', 'otro'])
export const assistanceStatus = pgEnum('assistance_status', ['requested', 'approved', 'declined'])
export const accreditationReason = pgEnum('accreditation_reason', ['paid', 'assistance_approved', 'waived'])
export const accreditationDelivery = pgEnum('accreditation_delivery', ['screen', 'download', 'print', 'email'])
export const admissionScanResult = pgEnum('admission_scan_result', ['admitted', 'already_admitted', 'not_eligible', 'revoked', 'expired', 'unknown'])
export const promotionKind = pgEnum('promotion_kind', ['bundle', 'group_fixed'])
export const emailKind = pgEnum('email_kind', ['registration_received', 'payment_instructions', 'group_payment_notice', 'accreditation_ready', 'settlement_reminder', 'assistance_review_request', 'assistance_approved', 'assistance_declined', 'payment_proof_submitted', 'registration_access', 'lot_changed'])
export const emailStatus = pgEnum('email_status', ['queued', 'sending', 'sent', 'failed', 'cancelled'])
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  venue: text('venue'),
  content: jsonb('content').$type<Record<string, string>>().notNull().default({}),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workshops = pgTable('workshops', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  venue: text('venue'),
  capacity: integer('capacity'), // null means unlimited; never infer from a payment count.
  activeLot: integer('active_lot').notNull().default(1),
  lotAutomationEnabled: boolean('lot_automation_enabled').notNull().default(false),
  lotNotificationEmail: text('lot_notification_email'),
  registrationOpen: boolean('registration_open').notNull().default(false),
  liveStartedAt: timestamp('live_started_at', { withTimezone: true }),
  waitlistEnabled: boolean('waitlist_enabled').notNull().default(false),
  reservationMinutes: integer('reservation_minutes').notNull().default(30),
}, (table) => [
  uniqueIndex('workshops_event_unique').on(table.eventId),
  check('workshops_capacity_positive', sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
  check('workshops_lot_range', sql`${table.activeLot} BETWEEN 1 AND 3`),
  check('workshops_reservation_minutes_positive', sql`${table.reservationMinutes} BETWEEN 1 AND 1440`),
])

export const workshopLots = pgTable('workshop_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id),
  number: integer('number').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull().default('ARS'),
  advanceAfter: integer('advance_after'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('workshop_lots_number_unique').on(table.workshopId, table.number),
  check('workshop_lots_number_range', sql`${table.number} BETWEEN 1 AND 3`),
  check('workshop_lots_amount_positive', sql`${table.amountMinor} > 0`),
  check('workshop_lots_ars', sql`${table.currency} = 'ARS'`),
  check('workshop_lots_advance_after', sql`${table.advanceAfter} IS NULL OR (${table.number} < 3 AND ${table.advanceAfter} BETWEEN 1 AND 1000000)`),
])

export const workshopLotChanges = pgTable('workshop_lot_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id),
  fromLot: integer('from_lot').notNull(),
  toLot: integer('to_lot').notNull(),
  threshold: integer('threshold').notNull(),
  paidPlaces: integer('paid_places').notNull(),
  fromAmountMinor: integer('from_amount_minor').notNull(),
  toAmountMinor: integer('to_amount_minor').notNull(),
  toEmail: text('to_email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('lot_changes_by_workshop').on(table.workshopId, table.createdAt),
  check('lot_changes_forward_only', sql`${table.fromLot} BETWEEN 1 AND 2 AND ${table.toLot} = ${table.fromLot} + 1`),
  check('lot_changes_valid_count', sql`${table.threshold} > 0 AND ${table.paidPlaces} >= ${table.threshold}`),
  check('lot_changes_positive_prices', sql`${table.fromAmountMinor} > 0 AND ${table.toAmountMinor} > 0`),
])

export const workshopPromotions = pgTable('workshop_promotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id),
  code: text('code').notNull(),
  kind: promotionKind('kind').notNull(),
  active: boolean('active').notNull().default(false),
  bundleSize: integer('bundle_size'), // e.g. 3 for 3x2, 2 for 2x1.
  payablePeople: integer('payable_people'), // e.g. 2 for 3x2, 1 for 2x1.
  minPeople: integer('min_people'),
  maxPeople: integer('max_people'),
  groupTotalMinor: integer('group_total_minor'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('promotions_workshop_code_unique').on(table.workshopId, table.code),
  check('promotion_valid_window', sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}`),
  check('promotion_valid_shape', sql`(
    ${table.kind} = 'bundle' AND ${table.bundleSize} IS NOT NULL AND ${table.payablePeople} IS NOT NULL
      AND ${table.bundleSize} >= 2 AND ${table.payablePeople} >= 1
      AND ${table.payablePeople} < ${table.bundleSize}
      AND ${table.minPeople} IS NULL AND ${table.maxPeople} IS NULL AND ${table.groupTotalMinor} IS NULL
  ) OR (
    ${table.kind} = 'group_fixed' AND ${table.bundleSize} IS NULL AND ${table.payablePeople} IS NULL
      AND ${table.minPeople} IS NOT NULL AND ${table.maxPeople} IS NOT NULL AND ${table.groupTotalMinor} IS NOT NULL
      AND ${table.minPeople} >= 2 AND ${table.maxPeople} >= ${table.minPeople}
      AND ${table.groupTotalMinor} > 0
  )`),
])

export const registrations = pgTable('registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id),
  reference: text('reference').notNull().unique(),
  accessTokenHash: text('access_token_hash').notNull().unique(),
  creationKey: uuid('creation_key').notNull().unique(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  email: text('email').notNull(),
  normalizedEmail: text('normalized_email').notNull(),
  accreditationEmail: text('accreditation_email'),
  registeredAtOverride: timestamp('registered_at_override', { withTimezone: true }),
  accreditationBlocked: boolean('accreditation_blocked').notNull().default(false),
  phone: text('phone').notNull(),
  normalizedPhone: text('normalized_phone').notNull(),
  status: registrationStatus('status').notNull().default('pending'),
  isTest: boolean('is_test').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => adminUsers.id),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedBy: uuid('archived_by').references(() => adminUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('registrations_by_workshop_created').on(table.workshopId, table.createdAt),
  index('registrations_by_email_name').on(table.workshopId, table.normalizedEmail, table.normalizedName),
  index('registrations_by_phone_name').on(table.workshopId, table.normalizedPhone, table.normalizedName),
  check('registrations_deletion_actor', sql`(${table.deletedAt} IS NULL) = (${table.deletedBy} IS NULL)`),
  check('registrations_archive_actor', sql`(${table.archivedAt} IS NULL) = (${table.archivedBy} IS NULL)`),
  check('registrations_accreditation_email_length', sql`${table.accreditationEmail} IS NULL OR length(${table.accreditationEmail}) BETWEEN 3 AND 254`),
])

// Complete form data is separate from the legacy minimal registration API.
// No credential may be issued for a registration missing this record.
export const registrationIntakes = pgTable('registration_intakes', {
  registrationId: uuid('registration_id').primaryKey().references(() => registrations.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  documentNumber: text('document_number'),
  nickname: text('nickname'),
  country: text('country'),
  province: text('province'),
  locality: text('locality'),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
  prayerGroup: text('prayer_group'),
  movement: text('movement'),
  ecclesialState: ecclesialState('ecclesial_state').notNull(),
  occupation: text('occupation'),
  paymentDifficulty: boolean('payment_difficulty').notNull(),
  paymentDifficultyNotes: text('payment_difficulty_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('intake_first_name_present', sql`length(trim(${table.firstName})) > 0`),
  check('intake_last_name_present', sql`length(trim(${table.lastName})) > 0`),
  check('intake_document_format', sql`${table.documentNumber} IS NULL OR ${table.documentNumber} ~ '^[A-Z0-9-]{5,20}$'`),
  check('intake_nickname_length', sql`${table.nickname} IS NULL OR length(trim(${table.nickname})) BETWEEN 1 AND 80`),
  check('intake_difficulty_notes_only_if_requested', sql`${table.paymentDifficulty} OR ${table.paymentDifficultyNotes} IS NULL`),
])

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  status: reservationStatus('status').notNull().default('held'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('reservations_by_registration').on(table.registrationId),
  index('reservations_by_status_expiry').on(table.status, table.expiresAt),
])

export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminChangeId: uuid('admin_change_id'),
  supersededByAdmin: uuid('superseded_by_admin'),
  reportedSource: paymentSource('reported_source'),
  reportedFeeMinor: integer('reported_fee_minor').notNull().default(0),
  replacesAttemptId: uuid('replaces_attempt_id').unique('payment_attempts_replaces_attempt_id_key'),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  providerOrderId: text('provider_order_id').unique(),
  externalReference: text('external_reference').unique(),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  groupRequestHash: text('group_request_hash'),
  source: paymentSource('source').notNull(),
  status: paymentStatus('status').notNull().default('created'),
  amountMinor: integer('amount_minor'),
  paidAmountMinor: integer('paid_amount_minor').notNull().default(0),
  providerFeeMinor: integer('provider_fee_minor').notNull().default(0),
  checkoutUrl: text('checkout_url'),
  checkoutCreatedAt: timestamp('checkout_created_at', { withTimezone: true }),
  currency: text('currency').notNull().default('ARS'),
  providerStatus: text('provider_status'),
  providerStatusDetail: text('provider_status_detail'),
  providerUserId: text('provider_user_id'),
  providerApplicationId: text('provider_application_id'),
  providerLiveMode: boolean('provider_live_mode'),
  providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  manualVerifiedBy: uuid('manual_verified_by').references(() => adminUsers.id),
  manualVerifiedAt: timestamp('manual_verified_at', { withTimezone: true }),
  manualReference: text('manual_reference'),
  proofNotifiedAt: timestamp('proof_notified_at', { withTimezone: true }),
  proofReviewedAt: timestamp('proof_reviewed_at', { withTimezone: true }),
  proofReviewNote: text('proof_review_note'),
  payerName: text('payer_name'),
  payerEmail: text('payer_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('attempts_by_registration').on(table.registrationId, table.createdAt),
  foreignKey({ name: 'payment_attempts_replaces_attempt_id_fkey', columns: [table.replacesAttemptId], foreignColumns: [table.id] }),
  check('payment_attempts_amount_positive', sql`${table.amountMinor} > 0 OR (${table.source} = 'on_site' AND ${table.amountMinor} IS NULL AND ${table.status} <> 'approved')`),
  check('payment_attempts_paid_nonnegative', sql`${table.paidAmountMinor} >= 0`),
  check('payment_provider_fee_valid', sql`(${table.source} = 'mercado_pago' AND ${table.providerFeeMinor} >= 0 AND ${table.providerFeeMinor} < ${table.amountMinor}) OR (${table.source} <> 'mercado_pago' AND ${table.providerFeeMinor} = 0)`),
  check('payment_attempts_ars', sql`${table.currency} = 'ARS'`),
  check('group_request_hash_length', sql`${table.groupRequestHash} IS NULL OR length(${table.groupRequestHash}) = 64`),
  check('approved_mp_evidence', sql`${table.source} <> 'mercado_pago' OR ${table.status} <> 'approved' OR (
    ${table.providerOrderId} IS NOT NULL AND ${table.externalReference} IS NOT NULL
    AND ${table.providerStatus} IS NOT NULL AND ${table.providerStatusDetail} IS NOT NULL
    AND ${table.providerStatus} = 'processed' AND ${table.providerStatusDetail} = 'accredited'
    AND ${table.providerUserId} IS NOT NULL AND ${table.providerApplicationId} IS NOT NULL
    AND ${table.providerLiveMode} IS NOT NULL
    AND ${table.reconciledAt} IS NOT NULL AND ${table.paidAmountMinor} >= ${table.amountMinor}
  )`),
  check('approved_manual_evidence', sql`${table.source} = 'mercado_pago' OR ${table.status} <> 'approved' OR (
    ${table.manualVerifiedBy} IS NOT NULL AND ${table.manualVerifiedAt} IS NOT NULL
    AND ${table.amountMinor} IS NOT NULL AND ${table.paidAmountMinor} >= ${table.amountMinor}
  )`),
])

// Private evidence lives in PostgreSQL, not in public/ or a container's ephemeral filesystem.
export const paymentProofs = pgTable('payment_proofs', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentAttemptId: uuid('payment_attempt_id').notNull().references(() => paymentAttempts.id),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  filename: text('filename').notNull(),
  documentNumber: text('document_number'),
  driveFileName: text('drive_file_name'),
  driveFileId: text('drive_file_id').unique(),
  driveSyncedAt: timestamp('drive_synced_at', { withTimezone: true }),
  driveAttemptCount: integer('drive_attempt_count').notNull().default(0),
  driveNextAttemptAt: timestamp('drive_next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  driveLastError: text('drive_last_error'),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  data: bytea('data').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('payment_proofs_by_attempt').on(table.paymentAttemptId, table.uploadedAt),
  check('payment_proofs_size_limit', sql`${table.sizeBytes} BETWEEN 1 AND 5242880`),
  check('payment_proofs_sha256_length', sql`length(${table.sha256}) = 64`),
  check('payment_proofs_document_format', sql`${table.documentNumber} IS NULL OR ${table.documentNumber} ~ '^[A-Z0-9-]{5,20}$'`),
  check('payment_proofs_drive_attempts_nonnegative', sql`${table.driveAttemptCount} >= 0`),
])

export const workshopPaymentSettings = pgTable('workshop_payment_settings', {
  workshopId: uuid('workshop_id').primaryKey().references(() => workshops.id),
  mercadoPagoEnabled: boolean('mercado_pago_enabled').notNull().default(false),
  onlineServiceFeeMinor: integer('online_service_fee_minor').notNull().default(18_849),
  transferEnabled: boolean('transfer_enabled').notNull().default(true),
  onSiteEnabled: boolean('on_site_enabled').notNull().default(true),
  onSitePriceMinor: integer('on_site_price_minor'),
  transferAlias: text('transfer_alias'),
  transferProvider: text('transfer_provider'),
  transferHolder: text('transfer_holder'),
  transferDocument: text('transfer_document'),
  proofWhatsappE164: text('proof_whatsapp_e164'),
  fundsNeededDaysBefore: integer('funds_needed_days_before').notNull().default(3),
  reminderEmail: text('reminder_email'),
  reminderLeadDays: integer('reminder_lead_days').notNull().default(3),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('funds_needed_days_range', sql`${table.fundsNeededDaysBefore} BETWEEN 1 AND 90`),
  check('online_service_fee_range', sql`${table.onlineServiceFeeMinor} BETWEEN 0 AND 20000000`),
  check('on_site_price_range', sql`${table.onSitePriceMinor} IS NULL OR ${table.onSitePriceMinor} BETWEEN 100 AND 200000000`),
  check('reminder_lead_days_range', sql`${table.reminderLeadDays} BETWEEN 0 AND 30`),
])

// Availability/cost options are entered from the merchant's current Mercado
// Pago account. We do not assume public rates or change that account by API.
export const settlementOptions = pgTable('settlement_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id),
  releaseDays: integer('release_days').notNull(),
  feeBasisPoints: integer('fee_basis_points'),
  feeIncludesTax: boolean('fee_includes_tax').notNull().default(false),
  active: boolean('active').notNull().default(true),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('settlement_workshop_release_days_unique').on(table.workshopId, table.releaseDays),
  check('settlement_release_days_range', sql`${table.releaseDays} BETWEEN 0 AND 120`),
  check('settlement_fee_range', sql`${table.feeBasisPoints} IS NULL OR ${table.feeBasisPoints} BETWEEN 0 AND 10000`),
])

export const settlementReminders = pgTable('settlement_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id),
  recommendedReleaseDays: integer('recommended_release_days').notNull(),
  switchAt: timestamp('switch_at', { withTimezone: true }).notNull(),
  remindAt: timestamp('remind_at', { withTimezone: true }).notNull(),
  targetAvailableAt: timestamp('target_available_at', { withTimezone: true }).notNull(),
  emailTo: text('email_to').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  acknowledgedBy: uuid('acknowledged_by').references(() => adminUsers.id),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('settlement_reminder_switch_unique').on(table.workshopId, table.switchAt),
  index('settlement_reminders_due').on(table.acknowledgedAt, table.remindAt),
])

// Immutable price/discount snapshots for every person covered by one payment.
// A 3x2 or 2x1 attempt has multiple members and only one Mercado Pago order.
export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  attemptId: uuid('attempt_id').notNull().references(() => paymentAttempts.id),
  adminChangeId: uuid('admin_change_id'),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  lotId: uuid('lot_id').notNull().references(() => workshopLots.id),
  lotNumber: integer('lot_number').notNull(),
  promotionId: uuid('promotion_id').references(() => workshopPromotions.id),
  promotionCode: text('promotion_code'),
  baseAmountMinor: integer('base_amount_minor'),
  discountMinor: integer('discount_minor').notNull().default(0),
  dueAmountMinor: integer('due_amount_minor'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('allocations_attempt_registration_unique').on(table.attemptId, table.registrationId),
  index('allocations_by_registration').on(table.registrationId),
  check('allocations_lot_number_range', sql`${table.lotNumber} BETWEEN 1 AND 3`),
  check('allocations_base_positive', sql`${table.baseAmountMinor} IS NULL OR ${table.baseAmountMinor} > 0`),
  check('allocations_discount_range', sql`(${table.baseAmountMinor} IS NULL AND ${table.discountMinor} = 0) OR (${table.discountMinor} >= 0 AND ${table.discountMinor} <= ${table.baseAmountMinor})`),
  check('allocations_balance', sql`(${table.baseAmountMinor} IS NULL AND ${table.dueAmountMinor} IS NULL) OR (${table.baseAmountMinor} IS NOT NULL AND ${table.dueAmountMinor} = ${table.baseAmountMinor} - ${table.discountMinor})`),
])

// Select only reconciliation/accounting fields from GET /v1/orders/{id}.
// Never persist payment_method.token, QR payment payloads or client_token.
export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  attemptId: uuid('attempt_id').notNull().references(() => paymentAttempts.id),
  providerPaymentId: text('provider_payment_id').notNull().unique(),
  providerStatus: text('provider_status').notNull(),
  providerStatusDetail: text('provider_status_detail'),
  amountMinor: integer('amount_minor').notNull(),
  paidAmountMinor: integer('paid_amount_minor').notNull().default(0),
  paymentMethodType: text('payment_method_type'),
  paymentMethodId: text('payment_method_id'),
  installments: integer('installments'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('transactions_by_attempt').on(table.attemptId),
  check('payment_transactions_amount_positive', sql`${table.amountMinor} > 0`),
  check('payment_transactions_paid_nonnegative', sql`${table.paidAmountMinor} >= 0`),
  check('payment_transactions_installments_positive', sql`${table.installments} IS NULL OR ${table.installments} > 0`),
])

export const paymentRefunds = pgTable('payment_refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  attemptId: uuid('attempt_id').notNull().references(() => paymentAttempts.id),
  providerRefundId: text('provider_refund_id').notNull().unique(),
  providerPaymentId: text('provider_payment_id'),
  amountMinor: integer('amount_minor').notNull(),
  providerStatus: text('provider_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refunds_by_attempt').on(table.attemptId),
  check('payment_refunds_amount_positive', sql`${table.amountMinor} > 0`),
])

export const paymentChargebacks = pgTable('payment_chargebacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  attemptId: uuid('attempt_id').notNull().references(() => paymentAttempts.id),
  providerChargebackId: text('provider_chargeback_id').notNull().unique(),
  providerPaymentId: text('provider_payment_id'),
  providerStatus: text('provider_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('chargebacks_by_attempt').on(table.attemptId)])

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerEventId: text('provider_event_id').notNull().unique(),
  resourceId: text('resource_id').notNull(),
  topic: text('topic').notNull(),
  action: text('action'),
  applicationId: text('application_id'),
  sellerUserId: text('seller_user_id'),
  liveMode: boolean('live_mode'),
  requestId: text('request_id'),
  retryCount: integer('retry_count').notNull().default(0),
  lastTriedAt: timestamp('last_tried_at', { withTimezone: true }),
  // Sanitized event metadata only, not the provider's full raw payment response.
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  errorCode: text('error_code'),
}, (table) => [
  index('webhooks_pending').on(table.processedAt, table.receivedAt),
  index('webhooks_by_resource').on(table.resourceId, table.receivedAt),
  check('webhook_retry_nonnegative', sql`${table.retryCount} >= 0`),
])

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUserId: text('auth_user_id').references(() => authUser.id).unique(),
  email: text('email').notNull().unique(),
  role: adminRole('role').notNull(),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const assistanceRequests = pgTable('assistance_requests', {
  registrationId: uuid('registration_id').primaryKey().references(() => registrations.id),
  status: assistanceStatus('status').notNull().default('requested'),
  reviewedBy: uuid('reviewed_by').references(() => adminUsers.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  decisionNote: text('decision_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('assistance_by_status').on(table.status, table.createdAt),
  check('assistance_review_consistent', sql`(${table.status} = 'requested' AND ${table.reviewedAt} IS NULL AND ${table.reviewedBy} IS NULL) OR (${table.status} <> 'requested' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedBy} IS NOT NULL)`),
])

// Complimentary/organizer passes are distinct from financial-difficulty
// requests, but both require an identified operator's explicit approval.
export const feeWaivers = pgTable('fee_waivers', {
  registrationId: uuid('registration_id').primaryKey().references(() => registrations.id),
  reason: text('reason').notNull(),
  approvedBy: uuid('approved_by').notNull().references(() => adminUsers.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => adminUsers.id),
  note: text('note'),
}, (table) => [check('fee_waivers_reason_present', sql`length(trim(${table.reason})) > 0`)])

// QR encodes a versioned, random bearer token. Persist its hash for scanning
// and an AES-GCM copy for authorized reprint/email, never plaintext or a
// Mercado Pago payment-method QR.
export const accreditationCredentials = pgTable('accreditation_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  version: integer('version').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenCiphertext: text('token_ciphertext').notNull(),
  tokenIv: text('token_iv').notNull(),
  tokenAuthTag: text('token_auth_tag').notNull(),
  encryptionKeyId: text('encryption_key_id').notNull(),
  reason: accreditationReason('reason').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => adminUsers.id),
  revocationReason: text('revocation_reason'),
}, (table) => [
  uniqueIndex('accreditation_registration_version_unique').on(table.registrationId, table.version),
  uniqueIndex('accreditation_one_active_per_registration').on(table.registrationId).where(sql`${table.revokedAt} IS NULL`),
  index('accreditation_by_registration').on(table.registrationId, table.issuedAt),
  check('accreditation_token_hash_length', sql`length(${table.tokenHash}) = 64`),
  check('accreditation_version_positive', sql`${table.version} > 0`),
  check('accreditation_expiry_after_issue', sql`${table.expiresAt} > ${table.issuedAt}`),
])

// Tracks display/download/print as an audit event. No rendered PDF or QR
// payload is stored; reissue rotates the credential and revokes the old one.
export const accreditationDeliveries = pgTable('accreditation_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  credentialId: uuid('credential_id').notNull().references(() => accreditationCredentials.id),
  channel: accreditationDelivery('channel').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('accreditation_deliveries_by_credential').on(table.credentialId, table.createdAt)])

export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id).unique(),
  credentialId: uuid('credential_id').notNull().references(() => accreditationCredentials.id),
  scannedBy: uuid('scanned_by').notNull().references(() => adminUsers.id),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  entryPoint: text('entry_point'),
}, (table) => [index('check_ins_by_time').on(table.scannedAt)])

export const admissionScans = pgTable('admission_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  credentialId: uuid('credential_id').references(() => accreditationCredentials.id),
  scannedBy: uuid('scanned_by').notNull().references(() => adminUsers.id),
  result: admissionScanResult('result').notNull(),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  entryPoint: text('entry_point'),
}, (table) => [index('admission_scans_by_time').on(table.scannedAt)])

export const registrationRecoveries = pgTable('registration_recoveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  codeHash: text('code_hash').notNull(),
  codeEncrypted: text('code_encrypted').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('recoveries_by_registration').on(table.registrationId, table.createdAt),
  check('recovery_attempts_range', sql`${table.attempts} BETWEEN 0 AND 5`),
])

export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  kind: emailKind('kind').notNull(),
  status: emailStatus('status').notNull().default('queued'),
  toEmail: text('to_email').notNull(),
  registrationId: uuid('registration_id').references(() => registrations.id),
  paymentAttemptId: uuid('payment_attempt_id').references(() => paymentAttempts.id),
  paymentProofId: uuid('payment_proof_id').references(() => paymentProofs.id),
  recoveryId: uuid('recovery_id').references(() => registrationRecoveries.id),
  credentialId: uuid('credential_id').references(() => accreditationCredentials.id),
  settlementReminderId: uuid('settlement_reminder_id').references(() => settlementReminders.id),
  lotChangeId: uuid('lot_change_id').references(() => workshopLotChanges.id),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  manualResend: boolean('manual_resend').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('email_outbox_ready').on(table.status, table.nextAttemptAt),
  index('email_outbox_accreditation_history').on(table.registrationId, table.createdAt).where(sql`${table.kind}='accreditation_ready'`),
  check('email_outbox_manual_resend_kind', sql`NOT ${table.manualResend} OR (${table.kind}='accreditation_ready' AND ${table.credentialId} IS NOT NULL)`),
  check('email_outbox_attempts_nonnegative', sql`${table.attemptCount} >= 0`),
  check('email_outbox_one_subject', sql`(
    (${table.registrationId} IS NOT NULL)::integer +
    (${table.settlementReminderId} IS NOT NULL)::integer +
    (${table.lotChangeId} IS NOT NULL)::integer = 1
  )`),
])

export const emailDeliveryReports = pgTable('email_delivery_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailId: uuid('email_id').notNull().references(() => emailOutbox.id),
  reportKey: text('report_key').notNull().unique(),
  action: text('action').notNull(),
  enhancedStatus: text('enhanced_status').notNull(),
  reasonCode: text('reason_code').notNull(),
  diagnostic: text('diagnostic').notNull(),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('email_delivery_reports_by_email').on(table.emailId, table.reportedAt),
  check('email_delivery_reports_action_check', sql`${table.action} IN ('failed','delayed')`)])

export const emailBounceSync = pgTable('email_bounce_sync', {
  id: integer('id').primaryKey(),
  cursors: jsonb('cursors').notNull().default({}),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  requestId: uuid('request_id'),
  requestedAt: timestamp('requested_at', { withTimezone: true }),
  requestedBy: uuid('requested_by').references(() => adminUsers.id),
  requestStatus: text('request_status').notNull().default('idle'),
  completedRequestId: uuid('completed_request_id'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [check('email_bounce_sync_id_check', sql`${table.id}=1`)])

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => adminUsers.id),
  action: text('action').notNull(),
  subjectId: uuid('subject_id'),
  reason: text('reason'),
  changes: jsonb('changes').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('audit_by_time').on(table.createdAt)])

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
})

export const operationalIncidents = pgTable('operational_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventSlug: text('event_slug').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  source: text('source').notNull(),
  operation: text('operation').notNull(),
  code: text('code').notNull(),
  registrationId: uuid('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('operational_incidents_identity').on(table.source, table.correlationId, table.code),
  index('operational_incidents_by_time').on(table.eventSlug, table.createdAt),
  index('operational_incidents_by_registration').on(table.registrationId, table.createdAt),
  check('operational_incidents_source', sql`${table.source} IN ('client','server')`),
  check('operational_incidents_details_size', sql`octet_length(${table.details}::text)<=1024`),
])

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  subjectId: uuid('subject_id'),
  status: text('status').notNull().default('ready'),
  attempts: integer('attempts').notNull().default(0),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('jobs_ready').on(table.status, table.runAfter)])

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const registrationStatus = pgEnum('registration_status', ['pending', 'waiting', 'confirmed', 'cancelled', 'review'])
export const reservationStatus = pgEnum('reservation_status', ['held', 'expired', 'released', 'used'])
export const paymentStatus = pgEnum('payment_status', ['created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'review'])
export const paymentSource = pgEnum('payment_source', ['mercado_pago', 'manual'])
export const adminRole = pgEnum('admin_role', ['configuration', 'registration_operator'])

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
  registrationOpen: boolean('registration_open').notNull().default(false),
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
}, (table) => [
  uniqueIndex('workshop_lots_number_unique').on(table.workshopId, table.number),
  check('workshop_lots_number_range', sql`${table.number} BETWEEN 1 AND 3`),
  check('workshop_lots_amount_positive', sql`${table.amountMinor} > 0`),
  check('workshop_lots_ars', sql`${table.currency} = 'ARS'`),
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
  phone: text('phone').notNull(),
  normalizedPhone: text('normalized_phone').notNull(),
  status: registrationStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('registrations_by_workshop_created').on(table.workshopId, table.createdAt),
  index('registrations_by_email_name').on(table.workshopId, table.normalizedEmail, table.normalizedName),
  index('registrations_by_phone_name').on(table.workshopId, table.normalizedPhone, table.normalizedName),
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
  registrationId: uuid('registration_id').notNull().references(() => registrations.id),
  providerOrderId: text('provider_order_id').unique(),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  source: paymentSource('source').notNull(),
  status: paymentStatus('status').notNull().default('created'),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull().default('ARS'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('attempts_by_registration').on(table.registrationId, table.createdAt),
  check('payment_attempts_amount_positive', sql`${table.amountMinor} > 0`),
  check('payment_attempts_ars', sql`${table.currency} = 'ARS'`),
])

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerEventId: text('provider_event_id').notNull().unique(),
  resourceId: text('resource_id').notNull(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  errorCode: text('error_code'),
}, (table) => [index('webhooks_pending').on(table.processedAt, table.receivedAt)])

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  role: adminRole('role').notNull(),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

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

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  subjectId: uuid('subject_id'),
  status: text('status').notNull().default('ready'),
  attempts: integer('attempts').notNull().default(0),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('jobs_ready').on(table.status, table.runAfter)])

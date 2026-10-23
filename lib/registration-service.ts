import 'server-only'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { and, desc, eq, ne, or, sql } from 'drizzle-orm'
import { getDb } from './db'
import { events, rateLimits, registrations, reservations, workshops } from './schema'
import { normalizeIdentity } from './registration-policy'

export type RegistrationInput = { name: string; email: string; phone: string; accessToken: string; creationKey: string }
export type Result = { code: number; body: { reference: string; status: string } | { error: string } }
const closed: Result = { code: 503, body: { error: 'Las inscripciones todavía no están habilitadas.' } }
const duplicate: Result = { code: 409, body: { error: 'Revisá tu inscripción anterior o contactá a la organización.' } }

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function limitRegistrationRequest(ipHeader: string | null): Promise<boolean> {
  const db = getDb()
  // A global durable ceiling protects the server even without a trusted proxy.
  const buckets: Array<[string, number]> = [['registration:global', 500]]
  const secret = process.env.RATE_LIMIT_HMAC_KEY
  if (process.env.TRUST_REVERSE_PROXY === '1' && secret && secret.length >= 32 && ipHeader && /^[\da-fA-F:.]{3,45}$/.test(ipHeader)) {
    const ipHash = createHmac('sha256', secret).update(ipHeader).digest('hex')
    buckets.push([`registration:ip:${ipHash}`, 10])
  }
  for (const [key, limit] of buckets) {
    const result = await db.execute(sql`
      INSERT INTO ${rateLimits} (key, count, window_end) VALUES (${key}, 1, now() + interval '10 minutes')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN ${rateLimits.windowEnd} <= now() THEN 1 ELSE ${rateLimits.count} + 1 END,
        window_end = CASE WHEN ${rateLimits.windowEnd} <= now() THEN now() + interval '10 minutes' ELSE ${rateLimits.windowEnd} END
      RETURNING count
    `)
    if (Number(result.rows[0]?.count) > limit) return false
  }
  return true
}

export async function register(input: RegistrationInput): Promise<Result> {
  const eventSlug = process.env.WORKSHOP_EVENT_SLUG
  if (!eventSlug) return closed
  const tokenHash = digest(input.accessToken)
  const person = normalizeIdentity(input)
  const db = getDb()
  return db.transaction(async tx => {
    const [target] = await tx.select({ id: workshops.id }).from(workshops)
      .innerJoin(events, eq(workshops.eventId, events.id)).where(eq(events.slug, eventSlug)).limit(1)
    if (!target) return closed
    // Every writer which changes capacity, paid status or lot must also lock
    // this row in the same transaction. Never count without the workshop lock.
    await tx.execute(sql`SELECT id FROM ${workshops} WHERE ${workshops.id} = ${target.id} FOR UPDATE`)
    const [workshop] = await tx.select().from(workshops).where(eq(workshops.id, target.id)).limit(1)
    if (!workshop || !workshop.registrationOpen) return closed
    const [replay] = await tx.select().from(registrations)
      .where(and(eq(registrations.workshopId, workshop.id), eq(registrations.accessTokenHash, tokenHash))).limit(1)
    if (replay) {
      // A replay must reproduce the original operation, never silently accept
      // changed personal data under the same token and idempotency key.
      if (replay.creationKey !== input.creationKey || replay.normalizedName !== person.name ||
          replay.normalizedEmail !== person.email || replay.normalizedPhone !== person.phone) return duplicate
      const [hold] = await tx.select({ status: reservations.status, expiresAt: reservations.expiresAt })
        .from(reservations).where(eq(reservations.registrationId, replay.id))
        .orderBy(desc(reservations.createdAt)).limit(1)
      const status = replay.status === 'pending' && hold && (hold.status === 'expired' || (hold.status === 'held' && hold.expiresAt <= new Date()))
        ? 'expired' : replay.status
      return { code: 200, body: { reference: replay.reference, status } }
    }
    const conflicts = await tx.select({ id: registrations.id }).from(registrations).where(and(
      eq(registrations.workshopId, workshop.id),
      ne(registrations.status, 'cancelled'),
      eq(registrations.normalizedName, person.name),
      or(eq(registrations.normalizedEmail, person.email), eq(registrations.normalizedPhone, person.phone)),
    )).limit(1)
    if (conflicts.length) return duplicate
    let status: 'pending' | 'waiting' = 'pending'
    if (workshop.capacity !== null) {
      const occupied = await tx.execute(sql`
        SELECT count(*)::int AS count FROM ${reservations} r
        JOIN ${registrations} g ON g.id = r.registration_id
        WHERE g.workshop_id = ${workshop.id}
          AND (r.status = 'used' OR (r.status = 'held' AND r.expires_at > now()))
      `)
      if (Number(occupied.rows[0]?.count) >= workshop.capacity) {
        if (!workshop.waitlistEnabled) return { code: 409, body: { error: 'El taller está completo.' } }
        status = 'waiting'
      }
    }
    const reference = randomBytes(12).toString('base64url')
    const [created] = await tx.insert(registrations).values({
      workshopId: workshop.id,
      reference,
      accessTokenHash: tokenHash,
      creationKey: input.creationKey,
      name: input.name.trim(),
      normalizedName: person.name,
      email: input.email.trim(),
      normalizedEmail: person.email,
      phone: input.phone.trim(),
      normalizedPhone: person.phone,
      status,
    }).returning({ id: registrations.id })
    if (status === 'pending') {
      await tx.insert(reservations).values({
        registrationId: created.id,
        expiresAt: new Date(Date.now() + workshop.reservationMinutes * 60_000),
      })
    }
    return { code: 201, body: { reference, status } }
  })
}

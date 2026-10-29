import { createHash } from 'node:crypto'
import { z } from 'zod'

const identifier = z.union([z.string().min(1).max(200), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).transform(String)
const notification = z.object({
  id: identifier.optional(), type: z.literal('order'), action: z.string().min(1).max(100),
  data: z.object({ id: z.string().regex(/^ORD[A-Z0-9]{8,100}$/), version: z.number().int().nonnegative().optional() }),
  application_id: identifier, user_id: identifier, live_mode: z.boolean(),
  date_created: z.iso.datetime({ offset: true }).optional(),
}).refine(value => value.id !== undefined || value.date_created !== undefined || value.data.version !== undefined,
  { message: 'Notification has no stable event identity' })

// Orders notifications can omit the top-level event id. Derive a stable key
// from event identity fields, not the delivery's request id (which may change
// on retry). Payload amounts/status never authorize a payment: the caller must
// still verify the signature and re-query the authenticated provider API.
export function parseMercadoPagoNotification(body: unknown, expected: {
  orderId: string; applicationId: string; sellerUserId: string; liveMode: boolean
}) {
  const value = notification.parse(body)
  if (value.data.id.toLowerCase() !== expected.orderId.toLowerCase() || value.application_id !== expected.applicationId ||
      value.user_id !== expected.sellerUserId || value.live_mode !== expected.liveMode) throw new Error('Mismatched notification')
  const eventId = value.id ?? 'order-event-' + createHash('sha256').update(JSON.stringify([
    value.application_id, value.user_id, value.live_mode, value.data.id, value.action,
    value.data.version ?? null, value.date_created ?? null,
  ])).digest('hex')
  return { eventId, orderId: value.data.id, action: value.action,
    applicationId: value.application_id, sellerUserId: value.user_id, liveMode: value.live_mode }
}

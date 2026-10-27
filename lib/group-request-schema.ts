import { z } from 'zod'
import { workshopPersonSchema } from './workshop-input.ts'

const common = {
  paymentMethod: z.enum(['bank_transfer', 'on_site']),
  promotionId: z.uuid().nullable().optional(),
  idempotencyKey: z.uuid().optional(),
  expectedQuoteHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}

export const groupRequestSchema = z.discriminatedUnion('mode', [
  z.object({ ...common, mode: z.literal('existing'),
    references: z.array(z.string().trim().min(6).max(80).regex(/^[A-Za-z0-9_-]+$/)).min(2).max(20),
    payerReference: z.string().trim().min(6).max(80).regex(/^[A-Za-z0-9_-]+$/),
  }).strict(),
  z.object({ ...common, mode: z.literal('new'), people: z.array(workshopPersonSchema).min(2).max(20),
    payerIndex: z.number().int().min(0).max(19),
  }).strict(),
])

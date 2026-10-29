import { z } from 'zod'
import { validWorkshopLocation } from './workshop-location.ts'

const personName = z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u)
const optionalText = (limit: number) => z.string().trim().max(limit).optional()
export const documentNumberSchema = z.string().trim().min(5).max(24)
  .regex(/^[A-Za-z0-9.\s-]+$/).transform(value => value.toUpperCase().replace(/[.\s]/g, ''))
  .refine(value => /^[A-Z0-9-]{5,20}$/.test(value))

export const workshopPersonSchema = z.object({
  firstName: personName,
  lastName: personName,
  documentNumber: documentNumberSchema,
  birthDate: z.iso.date().refine(value => {
    const date = new Date(`${value}T12:00:00Z`)
    return value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10) &&
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
  phone: z.string().trim().min(7).max(25).regex(/^\+?[\d\s()-]+$/).refine(value => {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 7 && digits.length <= 15 && !/^(\d)\1+$/.test(digits)
  }),
  email: z.email().max(160),
  prayerGroup: optionalText(160),
  movement: optionalText(160),
  ecclesialState: z.enum(['laico', 'religioso', 'seminarista', 'diacono', 'postulante-novicia', 'presbitero', 'otro']),
  occupation: optionalText(160),
}).strict()

export const individualRegistrationSchema = workshopPersonSchema.extend({
  country: z.string().trim().min(2).max(80),
  province: z.string().trim().min(2).max(80),
  locality: optionalText(100),
  nickname: optionalText(80),
  resumeReceipts: z.array(z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()).max(8).optional(),
  paymentDifficulty: z.boolean(),
  paymentDifficultyNotes: optionalText(1000),
  paymentMethod: z.enum(['bank_transfer', 'on_site', 'mercado_pago']).optional(),
}).strict().superRefine((value, ctx) => {
  if (!validWorkshopLocation(value.country, value.province, value.locality)) ctx.addIssue({ code: 'custom', path: ['province'], message: 'Elegí una provincia argentina o completá tu provincia y localidad si venís de otro país.' })
  if (value.paymentDifficulty === !!value.paymentMethod) ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Elegí una forma de pago válida.' })
  if (value.paymentDifficulty && !value.paymentDifficultyNotes?.trim()) ctx.addIssue({ code: 'custom', path: ['paymentDifficultyNotes'], message: 'Contanos el motivo por el que necesitás ayuda para pagar.' })
  if (!value.paymentDifficulty && value.paymentDifficultyNotes?.trim()) ctx.addIssue({ code: 'custom', path: ['paymentDifficultyNotes'], message: 'No corresponde.' })
})

export type WorkshopPerson = z.infer<typeof workshopPersonSchema>

import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max)
export const ecclesialOptions = [
  ['laico', 'Laico/a'], ['religioso', 'Religioso/a'], ['seminarista', 'Seminarista'],
  ['diacono', 'Diácono'], ['postulante-novicia', 'Postulante / novicio/a'], ['presbitero', 'Presbítero'], ['otro', 'Otro'],
] as const

export const registrationEditSchema = z.object({
  reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/),
  version: z.string().regex(/^[a-f0-9]{32}$/),
  firstName: text(100).min(1).regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u), lastName: text(100).min(1).regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u),
  documentNumber: text(30).transform(value => value.toUpperCase().replace(/[.\s]/g, ''))
    .refine(value => /^[A-Z0-9-]{5,20}$/.test(value), 'Revisá el D.N.I.'),
  email: z.string().trim().pipe(z.email().max(254)).transform(value => value.toLowerCase()),
  phone: text(40).refine(value => /^[+\d\s().-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, '')), 'Revisá el teléfono.'),
  nickname: text(80), country: text(100), province: text(100), locality: text(150),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(value + 'T00:00:00Z')
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
      value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)
  }, 'Revisá la fecha de nacimiento.'),
  prayerGroup: text(200), movement: text(200), occupation: text(200),
  ecclesialState: z.enum(['laico', 'religioso', 'seminarista', 'diacono', 'postulante-novicia', 'presbitero', 'otro']),
  reason: text(500).min(5, 'Escribí un motivo de al menos cinco caracteres.'),
  confirmEmailChange: z.boolean(),
}).strict()

export type RegistrationEdit = z.infer<typeof registrationEditSchema>
export type PersonalFields = Omit<RegistrationEdit, 'reference' | 'version' | 'reason' | 'confirmEmailChange'>
export const personalLabels: Record<keyof PersonalFields, string> = {
  firstName: 'Nombre', lastName: 'Apellido', documentNumber: 'D.N.I. / documento', nickname: 'Nombre para el volante',
  email: 'Correo electrónico', phone: 'Teléfono', birthDate: 'Fecha de nacimiento', country: 'País', province: 'Provincia',
  locality: 'Localidad', prayerGroup: 'Grupo de oración / comunidad', movement: 'Movimiento',
  ecclesialState: 'Estado eclesial', occupation: 'Ocupación',
}

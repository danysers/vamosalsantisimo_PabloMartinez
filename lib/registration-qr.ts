import { createHmac, timingSafeEqual } from 'node:crypto'

const pattern = /^VASR1\.([A-Za-z0-9_-]{10,48})\.([A-Za-z0-9_-]{43})$/
function signature(id: string, reference: string, creationKey: string) {
  const key = process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
  if (!key || key.length < 32) throw new Error('Registration QR unavailable')
  return createHmac('sha256', key).update(`workshop-registration-qr:v1:${id}:${reference}:${creationKey}`).digest('base64url')
}
export function createRegistrationQr(id: string, reference: string, creationKey: string) {
  const value = `VASR1.${reference}.${signature(id, reference, creationKey)}`
  if (!pattern.test(value)) throw new Error('Invalid registration reference')
  return value
}
export function registrationQrReference(value: string) { return value.match(pattern)?.[1] ?? null }
export function verifyRegistrationQr(value: string, id: string, reference: string, creationKey: string) {
  if (registrationQrReference(value) !== reference) return false
  const actual = value.match(pattern)![2]
  return timingSafeEqual(Buffer.from(actual), Buffer.from(signature(id, reference, creationKey)))
}

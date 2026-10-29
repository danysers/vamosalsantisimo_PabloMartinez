import { createHmac, timingSafeEqual } from 'node:crypto'

export function checkoutAccessToken(registrationId: string, creationKey: string) {
  const key = process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
  if (!key || key.length < 32) throw new Error('Checkout access unavailable')
  return createHmac('sha256', key).update(`workshop-checkout:v1:${registrationId}:${creationKey}`).digest('base64url')
}

export function hasCheckoutAccess(token: string, registrationId: string, creationKey: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const expected = checkoutAccessToken(registrationId, creationKey)
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

const returnLifetimeSeconds = 24 * 60 * 60
function returnSignature(reference: string, registrationId: string, creationKey: string, expires: number) {
  const key = process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
  if (!key || key.length < 32) throw new Error('Checkout return unavailable')
  return createHmac('sha256', key).update(`workshop-return:v1:${reference}:${registrationId}:${creationKey}:${expires}`).digest('base64url')
}

// A separate, expiring capability permits a payment return in a fresh browser
// tab. It cannot mark a payment approved or be used as a checkout access token.
export function checkoutReturnToken(reference: string, registrationId: string, creationKey: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + returnLifetimeSeconds
  return `v1.${expires}.${returnSignature(reference, registrationId, creationKey, expires)}`
}

export function hasCheckoutReturn(token: string, reference: string, registrationId: string, creationKey: string, now = Date.now()) {
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return false
  const expires = Number(match[1]), current = Math.floor(now / 1000)
  if (expires <= current || expires > current + returnLifetimeSeconds + 60) return false
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(returnSignature(reference, registrationId, creationKey, expires)))
}

export function localWorkshopTestMode(origin: string) {
  try {
    return process.env.NODE_ENV === 'development' && process.env.WORKSHOP_LOCAL_TEST_MODE === '1' &&
      process.env.MP_ENVIRONMENT === 'test' && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname)
  } catch { return false }
}

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

export function localWorkshopTestMode(origin: string) {
  try {
    return process.env.NODE_ENV === 'development' && process.env.WORKSHOP_LOCAL_TEST_MODE === '1' &&
      process.env.MP_ENVIRONMENT === 'test' && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname)
  } catch { return false }
}

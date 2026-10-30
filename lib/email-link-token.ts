import { createHmac, timingSafeEqual } from 'node:crypto'

export type EmailLinkPurpose = 'proof' | 'pass'
export type EmailLinkIdentity = { id: string; reference: string; creationKey: string; email: string; credentialId?: string }
const lifetime = 120 * 86_400
function signature(purpose: EmailLinkPurpose, identity: EmailLinkIdentity, expires: number) {
  const key = process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
  if (!key || key.length < 32) throw new Error('Email link unavailable')
  return createHmac('sha256', key).update(JSON.stringify(['workshop-email:v1', purpose, identity.id,
    identity.reference, identity.creationKey, identity.email.toLowerCase(), identity.credentialId || '', expires])).digest('base64url')
}
export function emailLinkToken(purpose: EmailLinkPurpose, identity: EmailLinkIdentity, endsAt: Date, now = Date.now()) {
  const expires = Math.min(Math.floor(endsAt.getTime() / 1000), Math.floor(now / 1000) + lifetime)
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(now / 1000)) throw new Error('Email link expired')
  return `v1.${expires}.${signature(purpose, identity, expires)}`
}
export function hasEmailLink(token: string, purpose: EmailLinkPurpose, identity: EmailLinkIdentity, now = Date.now()) {
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return false
  const expires = Number(match[1]), seconds = Math.floor(now / 1000)
  if (expires <= seconds || expires > seconds + lifetime + 60) return false
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(purpose, identity, expires)))
}
export function workshopEmailUrl(purpose: EmailLinkPurpose, identity: EmailLinkIdentity, endsAt: Date) {
  const origin = new URL(process.env.SITE_ORIGIN || 'https://vamosalsantisimo.com')
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      (origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Invalid public email origin')
  const url = new URL(purpose === 'proof' ? '/formacion/comprobante' : '/formacion/acreditacion', origin)
  url.searchParams.set('reference', identity.reference)
  // A purpose-bound capability in the fragment never enters access logs or Referer.
  url.hash = new URLSearchParams({ [purpose]: emailLinkToken(purpose, identity, endsAt) }).toString()
  return url.toString()
}

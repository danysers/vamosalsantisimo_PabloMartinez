import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// The QR contains no name, payment data or Mercado Pago QR. It is an opaque
// 256-bit credential that the authenticated admission scanner will look up.
const qrPattern = /^VAS1\.[A-Za-z0-9_-]{43}$/

export function hashAccreditationQr(qrValue: string): string {
  if (!qrPattern.test(qrValue)) throw new Error('Invalid accreditation QR')
  return createHash('sha256').update(qrValue).digest('hex')
}

export function createAccreditationQr(): { qrValue: string; tokenHash: string } {
  const qrValue = `VAS1.${randomBytes(32).toString('base64url')}`
  return { qrValue, tokenHash: hashAccreditationQr(qrValue) }
}

function readKey(base64url: string): Buffer {
  const key = Buffer.from(base64url, 'base64url')
  if (key.length !== 32 || key.toString('base64url') !== base64url) throw new Error('Invalid accreditation encryption key')
  return key
}

export function encryptAccreditationQr(qrValue: string, keyBase64url: string, registrationId: string, version: number) {
  hashAccreditationQr(qrValue)
  if (!registrationId || !Number.isInteger(version) || version < 1) throw new Error('Invalid accreditation identity')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', readKey(keyBase64url), iv)
  cipher.setAAD(Buffer.from(`${registrationId}:${version}`))
  const ciphertext = Buffer.concat([cipher.update(qrValue, 'utf8'), cipher.final()])
  return {
    tokenCiphertext: ciphertext.toString('base64url'),
    tokenIv: iv.toString('base64url'),
    tokenAuthTag: cipher.getAuthTag().toString('base64url'),
  }
}

export function decryptAccreditationQr(
  encrypted: { tokenCiphertext: string; tokenIv: string; tokenAuthTag: string },
  keyBase64url: string,
  registrationId: string,
  version: number,
): string {
  const decipher = createDecipheriv('aes-256-gcm', readKey(keyBase64url), Buffer.from(encrypted.tokenIv, 'base64url'))
  decipher.setAAD(Buffer.from(`${registrationId}:${version}`))
  decipher.setAuthTag(Buffer.from(encrypted.tokenAuthTag, 'base64url'))
  const qrValue = Buffer.concat([decipher.update(Buffer.from(encrypted.tokenCiphertext, 'base64url')), decipher.final()]).toString('utf8')
  hashAccreditationQr(qrValue)
  return qrValue
}

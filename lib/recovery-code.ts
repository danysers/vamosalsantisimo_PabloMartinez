import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function secret() {
  const value = process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
  if (!value || value.length < 32) throw new Error('Registration recovery unavailable')
  return value
}
export function recoveryCodeHash(id: string, code: string) {
  return createHmac('sha256', secret()).update(`workshop-recovery:v1:${id}:${code}`).digest('hex')
}
export function matchesRecoveryCode(id: string, code: string, expected: string) {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(recoveryCodeHash(id, code), 'hex'), Buffer.from(expected, 'hex'))
}
function encryptionKey() { return createHash('sha256').update('workshop-recovery-mail:v1:').update(secret()).digest() }
export function encryptRecoveryCode(id: string, code: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(id))
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64url')).join('.')
}
export function decryptRecoveryCode(id: string, encrypted: string) {
  const parts = encrypted.split('.')
  if (parts.length !== 3) throw new Error('Invalid recovery envelope')
  const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, 'base64url'))
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid recovery envelope')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(tag)
  const code = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid recovery code')
  return code
}

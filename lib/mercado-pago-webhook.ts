import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyMercadoPagoSignature(input: { signature: string | null; requestId: string | null; resourceId: string; secret: string }) {
  if (!input.signature || !input.requestId || !/^[A-Za-z0-9-]{8,100}$/.test(input.requestId) ||
      !/^ORD[A-Z0-9]{8,100}$/i.test(input.resourceId) || input.secret.length < 16) return false
  const parts = input.signature.split(',').map(part => part.trim().split('='))
  const timestamps = parts.filter(([key]) => key === 'ts')
  const hashes = parts.filter(([key]) => key === 'v1')
  if (timestamps.length !== 1 || hashes.length !== 1 || !/^\d{10,13}$/.test(timestamps[0][1]) || !/^[a-f0-9]{64}$/i.test(hashes[0][1])) return false
  // Mercado Pago canonicalizes alphanumeric data.id to lowercase. A valid
  // replay is deduplicated in PostgreSQL and always re-queries the resource.
  const manifest = `id:${input.resourceId.toLowerCase()};request-id:${input.requestId};ts:${timestamps[0][1]};`
  const actual = Buffer.from(hashes[0][1], 'hex')
  const expected = createHmac('sha256', input.secret).update(manifest).digest()
  return timingSafeEqual(actual, expected)
}

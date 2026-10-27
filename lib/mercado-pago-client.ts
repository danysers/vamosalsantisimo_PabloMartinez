import 'server-only'
import { randomUUID } from 'node:crypto'
import { buildCheckoutOrder, parseCheckoutOrderResponse, type CheckoutOrderInput } from './checkout-pro-contract'

// Server-side adapter only. Deliberately not wired to a public endpoint until
// approved prices, persistent attempts, and verified webhook reconciliation exist.
export async function createCheckoutProOrder(input: CheckoutOrderInput, idempotencyKey: string) {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (process.env.MP_CHECKOUT_ENABLED !== '1' || !accessToken) throw new Error('Checkout is not configured')
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(idempotencyKey)) throw new Error('Invalid idempotency key')
  const response = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Idempotency-Key': idempotencyKey,
      'X-Request-Id': randomUUID(),
    },
    body: JSON.stringify(buildCheckoutOrder(input)),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Checkout provider unavailable (${response.status})`)
  const data: unknown = await response.json()
  return parseCheckoutOrderResponse(data, input)
}

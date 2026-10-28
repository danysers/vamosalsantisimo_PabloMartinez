import 'server-only'
import { randomUUID } from 'node:crypto'
import { buildCheckoutOrder, parseCheckoutOrderResponse, type CheckoutOrderInput } from './checkout-pro-contract'

export function mercadoPagoConfig(requireEnabled = true) {
  const accessToken = process.env.MP_ACCESS_TOKEN
  const sellerUserId = process.env.MP_SELLER_USER_ID
  const applicationId = process.env.MP_APPLICATION_ID
  const environment = process.env.MP_ENVIRONMENT
  if ((requireEnabled && process.env.MP_CHECKOUT_ENABLED !== '1') || !accessToken || !sellerUserId || !applicationId ||
      !['test', 'production'].includes(environment || '') || (process.env.WORKSHOP_CHECKOUT_TOKEN_KEY?.length ?? 0) < 32) throw new Error('Checkout is not configured')
  if (requireEnabled && environment === 'production') {
    const origin = process.env.MP_PUBLIC_ORIGIN || process.env.SITE_ORIGIN
    if (!origin || new URL(origin).protocol !== 'https:' || !process.env.MP_WEBHOOK_SECRET || process.env.REGISTRATION_EMAIL_READY !== '1') throw new Error('Production checkout is not ready')
  }
  return { accessToken, sellerUserId, applicationId, liveMode: environment === 'production' }
}

export function checkoutConfigured() {
  try { mercadoPagoConfig(); return true } catch { return false }
}

export function assertOrderEnvironment(orderId: string, liveMode: boolean) {
  if (!/^ORD[A-Z0-9]{8,100}$/.test(orderId) || orderId.startsWith('ORDTST') === liveMode) throw new Error('Wrong checkout environment')
}

// Server-only adapter. Callers persist the quoted amount and idempotency key
// before requesting the provider checkout; no card data reaches this service.
export async function createCheckoutProOrder(input: CheckoutOrderInput, idempotencyKey: string) {
  const { accessToken, sellerUserId, applicationId, liveMode } = mercadoPagoConfig()
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
  const order = parseCheckoutOrderResponse(data, input)
  const raw = data as { user_id?: unknown; integration_data?: { application_id?: unknown } }
  if (String(raw.user_id) !== sellerUserId || String(raw.integration_data?.application_id) !== applicationId) throw new Error('Unexpected checkout account')
  assertOrderEnvironment(order.id, liveMode)
  return order
}

export async function fetchCheckoutProOrder(orderId: string): Promise<unknown> {
  const { accessToken, liveMode } = mercadoPagoConfig(false)
  assertOrderEnvironment(orderId, liveMode)
  const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Payment verification unavailable')
  return response.json()
}

export async function cancelCheckoutProOrder(orderId: string, idempotencyKey: string) {
  const { accessToken, liveMode } = mercadoPagoConfig(false)
  assertOrderEnvironment(orderId, liveMode)
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(idempotencyKey)) throw new Error('Invalid cancellation key')
  const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  })
  // 409 may mean already canceled or processing. The caller always performs
  // an authenticated read and accepts only a matching, canceled, unpaid order.
  if (!response.ok && response.status !== 409) throw new Error('Checkout cancellation unavailable')
}

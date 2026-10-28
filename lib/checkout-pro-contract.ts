// Pure Checkout Pro (Orders API) boundary. No browser-supplied amount is accepted.
// The caller must freeze an approved ARS amount in payment_attempts first.
export type CheckoutOrderInput = {
  reference: string
  email: string
  amountMinor: number
  returnUrl?: string
}

export type CheckoutOrder = {
  id: string
  checkoutUrl: string
}

export function checkoutAmount(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Invalid checkout amount')
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`
}

export function buildCheckoutOrder(input: CheckoutOrderInput) {
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(input.reference)) throw new Error('Invalid checkout reference')
  if (input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('Invalid payer email')
  const amount = checkoutAmount(input.amountMinor)
  return {
    type: 'online',
    processing_mode: 'manual',
    total_amount: amount,
    external_reference: input.reference,
    payer: { email: input.email },
    items: [{ title: 'Taller de formación católica', unit_price: amount, quantity: 1 }],
    ...(input.returnUrl ? { config: { online: {
      success_url: input.returnUrl, failure_url: input.returnUrl,
      pending_url: input.returnUrl, auto_return: 'all',
    } } } : {}),
  } as const
}

// Treat a response from a payment provider as untrusted. In particular, never
// redirect a visitor to an arbitrary URL returned by an upstream error/proxy.
export function parseCheckoutOrderResponse(data: unknown, input: CheckoutOrderInput): CheckoutOrder {
  if (typeof data !== 'object' || data === null) throw new Error('Invalid checkout response')
  const value = data as Record<string, unknown>
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value.id) ||
      value.external_reference !== input.reference || value.total_amount !== checkoutAmount(input.amountMinor) ||
      value.currency !== 'ARS' || value.country_code !== 'ARG' || value.status !== 'created' ||
      typeof value.checkout_url !== 'string') throw new Error('Invalid checkout response')
  let url: URL
  try { url = new URL(value.checkout_url) } catch { throw new Error('Invalid checkout URL') }
  if (url.protocol !== 'https:' || !['mercadopago.com.ar', 'www.mercadopago.com.ar'].includes(url.hostname) ||
      !url.pathname.startsWith('/checkout/') || url.username || url.password) throw new Error('Invalid checkout URL')
  return { id: value.id, checkoutUrl: url.toString() }
}

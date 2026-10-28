import { arsMinor, type ExpectedOrder } from './mercado-pago-reconciliation'

// Cancellation must be checked independently of an approval projection: an
// unpaid canceled order can omit transactions entirely. Never accept money,
// an unrelated merchant/order, or an in-flight payment as a canceled checkout.
export function inspectUnpaidCheckoutOrder(raw: unknown, expected: ExpectedOrder & { liveMode: boolean }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid unpaid order')
  const order = raw as Record<string, unknown>
  const integration = order.integration_data as { application_id?: unknown } | undefined
  if (order.id !== expected.orderId || order.external_reference !== expected.externalReference ||
      order.currency !== 'ARS' || order.country_code !== 'ARG' || arsMinor(order.total_amount) !== expected.amountMinor ||
      String(order.user_id) !== expected.sellerUserId || String(integration?.application_id) !== expected.applicationId ||
      (order.live_mode !== undefined && order.live_mode !== expected.liveMode) ||
      !['created', 'action_required', 'canceled', 'cancelled'].includes(String(order.status)) ||
      (order.total_paid_amount !== undefined && arsMinor(order.total_paid_amount) !== 0)) throw new Error('Order is not safely unpaid')
  if (order.transactions !== undefined) {
    if (!order.transactions || typeof order.transactions !== 'object' || Array.isArray(order.transactions)) throw new Error('Invalid transactions')
    const transactions = order.transactions as Record<string, unknown>
    for (const name of ['payments', 'refunds', 'chargebacks']) {
      if (transactions[name] !== undefined && !Array.isArray(transactions[name])) throw new Error('Invalid transactions')
    }
    if ((transactions.refunds as unknown[] | undefined)?.length || (transactions.chargebacks as unknown[] | undefined)?.length) throw new Error('Order has reversals')
    for (const item of transactions.payments as Record<string, unknown>[] ?? []) {
      if (!item || !['created', 'pending', 'action_required', 'canceled', 'cancelled', 'failed', 'rejected'].includes(String(item.status)) ||
          (item.paid_amount !== undefined && arsMinor(item.paid_amount) !== 0)) throw new Error('Payment is processing')
    }
  }
  const updatedAt = typeof order.last_updated_date === 'string' ? new Date(order.last_updated_date) : new Date()
  if (!Number.isFinite(updatedAt.getTime())) throw new Error('Invalid order timestamp')
  return { canceled: ['canceled', 'cancelled'].includes(String(order.status)), updatedAt }
}

// Pure, selective projection of GET /v1/orders/{id}. Never save the full
// provider response: it can include client/payment tokens and payment QR data.
type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider order')
  return value as RecordValue
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) throw new Error('Invalid provider order')
  return value
}

function optionalText(value: unknown): string | null {
  return value === undefined || value === null ? null : text(value)
}

function identifier(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  return text(value)
}

export function arsMinor(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid ARS amount')
  const [whole, cents = ''] = value.split('.')
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor) || minor > 2_147_483_647) throw new Error('Invalid ARS amount')
  return minor
}

export type ExpectedOrder = {
  orderId: string
  externalReference: string
  amountMinor: number
  sellerUserId: string
  applicationId: string
}

export function projectMercadoPagoOrder(raw: unknown, expected: ExpectedOrder) {
  const order = object(raw)
  const integration = object(order.integration_data)
  if (order.id !== expected.orderId || order.external_reference !== expected.externalReference ||
      order.currency !== 'ARS' || order.country_code !== 'ARG' ||
      arsMinor(order.total_amount) !== expected.amountMinor ||
      identifier(order.user_id) !== expected.sellerUserId ||
      identifier(integration.application_id) !== expected.applicationId) {
    throw new Error('Provider order does not match local payment attempt')
  }
  const transactions = object(order.transactions)
  const paymentRows = transactions.payments
  const refundRows = transactions.refunds
  const chargebackRows = transactions.chargebacks
  if (!Array.isArray(paymentRows) || !Array.isArray(refundRows) || !Array.isArray(chargebackRows)) {
    throw new Error('Incomplete provider transactions')
  }
  const payments = paymentRows.map(row => {
    const payment = object(row)
    const method = payment.payment_method == null ? {} : object(payment.payment_method)
    const installments = method.installments == null ? null : method.installments
    if (installments !== null && (!Number.isInteger(installments) || Number(installments) < 1)) throw new Error('Invalid installments')
    return {
      providerPaymentId: text(payment.id),
      providerStatus: text(payment.status),
      providerStatusDetail: optionalText(payment.status_detail),
      amountMinor: arsMinor(payment.amount),
      paidAmountMinor: arsMinor(payment.paid_amount),
      paymentMethodType: optionalText(method.type),
      paymentMethodId: optionalText(method.id),
      installments: installments as number | null,
    }
  })
  const refunds = refundRows.map(row => {
    const refund = object(row)
    return {
      providerRefundId: text(refund.id),
      providerPaymentId: optionalText(refund.transaction_id),
      amountMinor: arsMinor(refund.amount),
      providerStatus: text(refund.status),
    }
  })
  const chargebacks = chargebackRows.map(row => {
    const chargeback = object(row)
    return {
      providerChargebackId: text(chargeback.id),
      providerPaymentId: optionalText(chargeback.transaction_id),
      providerStatus: text(chargeback.status),
    }
  })
  const paidAmountMinor = arsMinor(order.total_paid_amount)
  const providerStatus = text(order.status)
  const providerStatusDetail = optionalText(order.status_detail)
  // Only an accredited, fully paid order with matching completed payments and
  // no reported reversal can unlock the accreditation workflow.
  const approved = providerStatus === 'processed' && providerStatusDetail === 'accredited' &&
    paidAmountMinor >= expected.amountMinor && payments.length > 0 &&
    payments.some(p => p.providerStatus === 'processed' && p.providerStatusDetail === 'accredited') &&
    refunds.length === 0 && chargebacks.length === 0
  return {
    providerStatus,
    providerStatusDetail,
    paidAmountMinor,
    providerUserId: expected.sellerUserId,
    providerApplicationId: expected.applicationId,
    providerUpdatedAt: optionalText(order.last_updated_date),
    decision: approved ? 'approved' : 'review',
    payments,
    refunds,
    chargebacks,
  } as const
}

// Pure pricing over values read from PostgreSQL, never browser-supplied prices.
// The returned allocation amounts are frozen in payment_allocations before a
// Mercado Pago order is created. Prices edited later affect new quotes only.
export type PricedMember = { registrationId: string; lotId: string; lotNumber: number; baseAmountMinor: number }
export type Promotion =
  | { id: string; code: string; kind: 'bundle'; bundleSize: number; payablePeople: number }
  | { id: string; code: string; kind: 'group_fixed'; minPeople: number; maxPeople: number; groupTotalMinor: number }

export function quoteWorkshopPayment(members: PricedMember[], promotion?: Promotion) {
  if (!members.length || members.length > 100 || new Set(members.map(m => m.registrationId)).size !== members.length ||
      members.some(m => !m.registrationId || !m.lotId || !Number.isInteger(m.lotNumber) || m.lotNumber < 1 || m.lotNumber > 3 ||
        !Number.isSafeInteger(m.baseAmountMinor) || m.baseAmountMinor <= 0)) throw new Error('Invalid priced members')
  const subtotalMinor = members.reduce((sum, member) => sum + member.baseAmountMinor, 0)
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > 2_147_483_647) throw new Error('Invalid subtotal')
  const due = members.map(m => m.baseAmountMinor)
  if (promotion) {
    if (!promotion.id || !promotion.code || members.some(m => m.lotId !== members[0].lotId || m.baseAmountMinor !== members[0].baseAmountMinor)) {
      throw new Error('Promotion requires one lot price')
    }
    if (promotion.kind === 'bundle') {
      if (!Number.isInteger(promotion.bundleSize) || !Number.isInteger(promotion.payablePeople) ||
          promotion.bundleSize < 2 || promotion.payablePeople < 1 || promotion.payablePeople >= promotion.bundleSize ||
          members.length % promotion.bundleSize !== 0) throw new Error('Invalid bundle promotion')
      for (let i = 0; i < members.length; i++) {
        if (i % promotion.bundleSize >= promotion.payablePeople) due[i] = 0
      }
    } else if (promotion.kind === 'group_fixed') {
      if (!Number.isInteger(promotion.minPeople) || !Number.isInteger(promotion.maxPeople) ||
          members.length < promotion.minPeople || members.length > promotion.maxPeople ||
          !Number.isSafeInteger(promotion.groupTotalMinor) || promotion.groupTotalMinor <= 0 ||
          promotion.groupTotalMinor > subtotalMinor) throw new Error('Invalid group promotion')
      const each = Math.floor(promotion.groupTotalMinor / members.length)
      const remainder = promotion.groupTotalMinor % members.length
      for (let i = 0; i < members.length; i++) due[i] = each + (i < remainder ? 1 : 0)
    } else throw new Error('Invalid promotion kind')
  }
  const allocations = members.map((member, i) => ({
    ...member,
    promotionId: promotion?.id ?? null,
    promotionCode: promotion?.code ?? null,
    discountMinor: member.baseAmountMinor - due[i],
    dueAmountMinor: due[i],
  }))
  return {
    subtotalMinor,
    discountMinor: allocations.reduce((sum, allocation) => sum + allocation.discountMinor, 0),
    amountMinor: allocations.reduce((sum, allocation) => sum + allocation.dueAmountMinor, 0),
    allocations,
  }
}

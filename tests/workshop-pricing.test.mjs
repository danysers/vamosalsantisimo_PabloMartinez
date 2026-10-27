import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quoteWorkshopPayment } from '../lib/workshop-pricing.ts'

const members = [1, 2, 3].map(n => ({ registrationId: `r${n}`, lotId: 'lot-1', lotNumber: 1, baseAmountMinor: 1_000_000 }))

test('three editable lots are values from storage, not fixed pricing code', () => {
  const quote = quoteWorkshopPayment(members)
  assert.equal(quote.amountMinor, 3_000_000)
  assert.equal(quote.discountMinor, 0)
  assert.equal(quote.allocations.length, 3)
  const changed = quoteWorkshopPayment(members.map(m => ({ ...m, baseAmountMinor: 1_250_000 })))
  assert.equal(changed.amountMinor, 3_750_000)
  assert.equal(quote.amountMinor, 3_000_000)
})

test('3x2 and 2x1 cover individual members but produce one group charge', () => {
  const threeForTwo = quoteWorkshopPayment(members, { id: 'promo1', code: '3X2', kind: 'bundle', bundleSize: 3, payablePeople: 2 })
  assert.equal(threeForTwo.amountMinor, 2_000_000)
  assert.deepEqual(threeForTwo.allocations.map(a => a.dueAmountMinor), [1_000_000, 1_000_000, 0])
  const twoForOne = quoteWorkshopPayment(members.slice(0, 2), { id: 'promo2', code: '2X1', kind: 'bundle', bundleSize: 2, payablePeople: 1 })
  assert.equal(twoForOne.amountMinor, 1_000_000)
  assert.deepEqual(twoForOne.allocations.map(a => a.discountMinor), [0, 1_000_000])
})

test('one payer may cover a group without automatic discount; promotions cannot mix lots', () => {
  const mixed = [members[0], { ...members[1], lotId: 'lot-2', lotNumber: 2, baseAmountMinor: 1_500_000 }]
  assert.equal(quoteWorkshopPayment(mixed).amountMinor, 2_500_000)
  assert.throws(() => quoteWorkshopPayment(mixed, { id: 'promo2', code: '2X1', kind: 'bundle', bundleSize: 2, payablePeople: 1 }), /one lot price/)
  assert.throws(() => quoteWorkshopPayment(members.slice(0, 2), { id: 'promo1', code: '3X2', kind: 'bundle', bundleSize: 3, payablePeople: 2 }), /Invalid bundle/)
})

test('a configurable group total is allocated in exact integer cents', () => {
  const quote = quoteWorkshopPayment(members, { id: 'group', code: 'GRUPO', kind: 'group_fixed', minPeople: 3, maxPeople: 5, groupTotalMinor: 2_000_001 })
  assert.equal(quote.amountMinor, 2_000_001)
  assert.equal(quote.discountMinor, 999_999)
  assert.equal(quote.allocations.reduce((sum, a) => sum + a.dueAmountMinor, 0), quote.amountMinor)
  assert.throws(() => quoteWorkshopPayment(members, { id: 'group', code: 'GRUPO', kind: 'group_fixed', minPeople: 3, maxPeople: 5, groupTotalMinor: 4_000_000 }), /Invalid group/)
})

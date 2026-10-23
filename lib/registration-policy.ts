// Pure rules shared by tests and server use cases. Never trust a requested
// lot or amount from the browser: the server reads the active lot from storage.
export type PersonInput = { name: string; email: string; phone: string }
export type NormalizedIdentity = PersonInput

const lotPricesMinor = [1_000_000, 1_500_000, 2_000_000] as const

export function lotAmountMinor(activeLot: number): number {
  if (!Number.isInteger(activeLot) || activeLot < 1 || activeLot > 3) throw new Error('Invalid lot')
  return lotPricesMinor[activeLot - 1]
}

export function minorToArs(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid amount')
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
}

export function normalizeIdentity(person: PersonInput): NormalizedIdentity {
  const name = person.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR')
  const email = person.email.normalize('NFKC').trim().toLowerCase()
  const phone = person.phone.replace(/[^0-9]/g, '')
  if (name.length < 3 || !email || phone.length < 10 || phone.length > 15) throw new Error('Invalid identity')
  return { name, email, phone }
}

// Do not ban a shared family email or phone. A coinciding name AND contact
// signals a potential retry: recover or send to review, never silently discard.
export function classifyDuplicate(a: NormalizedIdentity, b: NormalizedIdentity): 'same-person-review' | 'distinct-person' | 'distinct-contact' {
  if (a.name !== b.name) return 'distinct-person'
  if (a.email === b.email || a.phone === b.phone) return 'same-person-review'
  return 'distinct-contact'
}

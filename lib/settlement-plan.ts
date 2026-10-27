// Scheduling suggestion only. Mercado Pago account payout timing is changed
// manually by the merchant; actual availability can differ by payment method.
export type SettlementOption = { releaseDays: number; feeBasisPoints: number; feeIncludesTax: boolean }

function argentinaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function startOfArgentinaDay(isoDate: string): Date {
  return new Date(`${isoDate}T03:00:00.000Z`)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

export function planSettlementReminders(input: {
  eventStartsAt: Date
  fundsBeforeDays: number
  reminderLeadDays: number
  options: SettlementOption[]
}) {
  if (Number.isNaN(input.eventStartsAt.getTime()) || !Number.isInteger(input.fundsBeforeDays) || input.fundsBeforeDays < 1 ||
      !Number.isInteger(input.reminderLeadDays) || input.reminderLeadDays < 0 || !input.options.length ||
      new Set(input.options.map(o => o.releaseDays)).size !== input.options.length ||
      input.options.some(o => !Number.isInteger(o.releaseDays) || o.releaseDays < 0 || o.releaseDays > 120 ||
        !Number.isInteger(o.feeBasisPoints) || o.feeBasisPoints < 0 || o.feeBasisPoints > 10000)) {
    throw new Error('Invalid settlement configuration')
  }
  if (new Set(input.options.map(o => o.feeIncludesTax)).size !== 1) throw new Error('Compare fees on the same tax basis')
  if (!input.options.some(o => o.releaseDays === 0)) throw new Error('Configure an immediate option or stop late checkout')
  const eventDay = startOfArgentinaDay(argentinaDate(input.eventStartsAt))
  const targetAvailableAt = addDays(eventDay, -input.fundsBeforeDays)
  const choose = (daysRemaining: number) => input.options
    .filter(o => o.releaseDays <= daysRemaining)
    .sort((a, b) => a.feeBasisPoints - b.feeBasisPoints || b.releaseDays - a.releaseDays)[0]
  const maxDays = Math.max(...input.options.map(o => o.releaseDays))
  const initial = choose(maxDays)
  const steps: Array<{ switchAt: Date; remindAt: Date; targetAvailableAt: Date; recommendedReleaseDays: number; feeBasisPoints: number }> = []
  let current = initial.releaseDays
  for (let daysRemaining = maxDays; daysRemaining > 0; daysRemaining--) {
    const next = choose(daysRemaining - 1)
    if (next.releaseDays === current) continue
    const switchAt = addDays(targetAvailableAt, -daysRemaining)
    steps.push({
      switchAt,
      remindAt: addDays(switchAt, -input.reminderLeadDays),
      targetAvailableAt,
      recommendedReleaseDays: next.releaseDays,
      feeBasisPoints: next.feeBasisPoints,
    })
    current = next.releaseDays
  }
  return { targetAvailableAt, initialReleaseDays: initial.releaseDays, steps }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSettlementReminders, recommendSettlementAt } from '../lib/settlement-plan.ts'

test('suggests manual tier changes before funds are needed three days pre-event', () => {
  const plan = planSettlementReminders({
    eventStartsAt: new Date('2026-12-19T18:00:00Z'), fundsBeforeDays: 3, reminderLeadDays: 3,
    options: [
      { releaseDays: 35, feeBasisPoints: 100, feeIncludesTax: false },
      { releaseDays: 18, feeBasisPoints: 200, feeIncludesTax: false },
      { releaseDays: 10, feeBasisPoints: 300, feeIncludesTax: false },
      { releaseDays: 0, feeBasisPoints: 400, feeIncludesTax: false },
    ],
  })
  assert.equal(plan.targetAvailableAt.toISOString(), '2026-12-16T03:00:00.000Z')
  assert.equal(plan.initialReleaseDays, 35)
  assert.deepEqual(plan.steps.map(s => [s.switchAt.toISOString().slice(0, 10), s.recommendedReleaseDays]), [
    ['2026-11-11', 18], ['2026-11-28', 10], ['2026-12-06', 0],
  ])
  assert.equal(plan.steps[0].remindAt.toISOString().slice(0, 10), '2026-11-08')
})

test('recommends the cheapest feasible phase at Argentine midnight and flags late collections', () => {
  const input = { eventStartsAt:new Date('2026-12-19T18:00:00Z'),fundsBeforeDays:3,reminderLeadDays:3,
    options:[{releaseDays:35,feeBasisPoints:100,feeIncludesTax:false},{releaseDays:18,feeBasisPoints:200,feeIncludesTax:false},
      {releaseDays:10,feeBasisPoints:300,feeIncludesTax:false},{releaseDays:0,feeBasisPoints:400,feeIncludesTax:false}] }
  for(const [instant,expected] of [['2026-10-27T23:00:00-03:00',35],['2026-11-10T23:59:59-03:00',35],
    ['2026-11-11T00:00:00-03:00',18],['2026-11-28T00:00:00-03:00',10],['2026-12-06T00:00:00-03:00',0]]) {
    const current=recommendSettlementAt({...input,now:new Date(instant)})
    assert.equal(current.recommendedReleaseDays,expected)
    assert.equal(current.deadlinePassed,false)
  }
  const late=recommendSettlementAt({...input,now:new Date('2026-12-16T00:00:00-03:00')})
  assert.equal(late.deadlinePassed,true)
  assert.equal(late.recommendedReleaseDays,0)
  assert.equal(late.nextChangeAt,null)
  assert.throws(()=>recommendSettlementAt({...input,now:new Date('invalid')}),/Invalid recommendation date/)
})

test('refuses unverified comparisons and allows skipping a more expensive tier', () => {
  const base = { eventStartsAt: new Date('2026-12-19T18:00:00Z'), fundsBeforeDays: 3, reminderLeadDays: 2 }
  const options = [
    { releaseDays: 35, feeBasisPoints: 100, feeIncludesTax: false },
    { releaseDays: 18, feeBasisPoints: 500, feeIncludesTax: false },
    { releaseDays: 10, feeBasisPoints: 300, feeIncludesTax: false },
    { releaseDays: 0, feeBasisPoints: 600, feeIncludesTax: false },
  ]
  assert.deepEqual(planSettlementReminders({ ...base, options }).steps.map(s => s.recommendedReleaseDays), [10, 0])
  assert.throws(() => planSettlementReminders({ ...base, options: options.slice(0, 3) }), /immediate option/)
  assert.throws(() => planSettlementReminders({ ...base, options: [{ ...options[0], feeIncludesTax: true }, ...options.slice(1)] }), /same tax basis/)
})

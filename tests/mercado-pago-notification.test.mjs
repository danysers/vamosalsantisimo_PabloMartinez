import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMercadoPagoNotification } from '../lib/mercado-pago-notification.ts'

const body = { action:'order.processed', api_version:'v1', application_id:'123456',
  data:{id:'ORD0123456789ABCDEFGHIJKLMN',version:1,status:'processed',total_amount:'100.00'},
  date_created:'2026-10-29T16:02:23.093625617Z',live_mode:true,type:'order',user_id:'987654' }
const expected = {orderId:body.data.id,applicationId:'123456',sellerUserId:'987654',liveMode:true}

test('current Orders payload without event id is accepted and retries have a stable identity', () => {
  const first=parseMercadoPagoNotification(body,expected)
  assert.match(first.eventId,/^order-event-[a-f0-9]{64}$/)
  assert.equal(parseMercadoPagoNotification({...body,extra:'ignored'},expected).eventId,first.eventId)
  assert.equal(parseMercadoPagoNotification({...body,data:{...body.data,total_amount:'999.00'}},expected).eventId,first.eventId)
  for (const changed of [{...body,action:'order.refunded'}, {...body,data:{...body.data,version:2}},
    {...body,date_created:'2026-10-29T16:03:23.093625617Z'}]) {
    assert.notEqual(parseMercadoPagoNotification(changed,expected).eventId,first.eventId)
  }
  assert.equal(parseMercadoPagoNotification({...body,id:123},expected).eventId,'123','legacy event id remains supported')
})

test('missing event id does not bypass order, seller, application or environment checks', () => {
  for (const changed of [{...body,data:{...body.data,id:'ORD999999999999999999999999'}},
    {...body,user_id:'other'}, {...body,application_id:'other'}, {...body,live_mode:false},
    {...body,type:'payment'}, {...body,date_created:'invalid'}, {...body,date_created:undefined,data:{id:body.data.id}}]) {
    assert.throws(()=>parseMercadoPagoNotification(changed,expected))
  }
})

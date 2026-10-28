import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source=await readFile(new URL('../public/formacion/checkout.js',import.meta.url),'utf8')
const flush=() => new Promise(resolve => setImmediate(resolve))

// Small DOM boundary for the checkout controller: real timers and network are
// replaced so we can cover long waits, interruptions and return-tab recovery.
function browser({storage=new Map(),url='http://localhost:3000/formacion/inscripcion',holdFirstStatus=false}={}) {
  const ids=new Map(), classes=new Map(), events=new Map(), windowEvents=new Map(), timers=new Map()
  let serial=0, now=0, printed=0, interrupted=false
  let releasePending
  const calls=[]
  let response={reference:'TestReference123',status:'pending',registrationStatus:'pending',baseAmountMinor:1_000_000,amountMinor:1_100_000,testMode:true,emailStatus:'queued',checkoutUrl:'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=ORDTST1234567890',paymentMethod:'mercado_pago',attemptId:'00000000-0000-4000-8000-000000000001',canChangeMethod:true,methods:{mercado_pago:true,bank_transfer:true,on_site:true},transfer:{alias:'test.alias',provider:'Banco de prueba',whatsappUrl:'https://wa.me/5493704000000'}}
  class Element {
    constructor(){this.hidden=false;this.dataset={};this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){}};this.handlers=new Map();this.isConnected=true}
    set id(value){this._id=value;ids.set(value,this)} get id(){return this._id}
    set className(value){this._class=value;for(const name of value.split(' ')) classes.set(name,this)}
    append(...children){this.children=children}
    setAttribute(name,value){this[name]=value}
    removeAttribute(name){delete this[name]}
    querySelector(selector){return selector.startsWith('#')?ids.get(selector.slice(1)):classes.get(selector.slice(1))}
    addEventListener(name,callback){this.handlers.set(name,callback)}
    focus(){}
    set innerHTML(value){this.html=value;for(const tag of value.matchAll(/<[a-z]+\b([^>]*)>/g)){const el=new Element();const id=tag[1].match(/id="([^"]+)"/);const cls=tag[1].match(/class="([^"]+)"/);if(id)el.id=id[1];if(cls)el.className=cls[1]}}
  }
  for(const id of ['registration-result','registration-result-title','registration-reference','payment-next','payment-next-title','payment-next-description','registration-grid']) {const el=new Element();el.id=id}
  for(const name of ['result-intro','result-symbol']) {const el=new Element();el.className=name}
  const document={hidden:false,body:{classList:{add(){}}},title:'',
    getElementById:id=>ids.get(id),createElement:()=>new Element(),
    querySelector:selector=>selector==='[data-payment-return]'&&location.pathname==='/formacion/pago'?ids.get('registration-result'):null,
    addEventListener:(name,callback)=>events.set(name,callback)}
  const location=new URL(url)
  const context={document,location,URL,URLSearchParams,Intl,JSON,console,queueMicrotask,
    sessionStorage:{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)},
    history:{state:{},replaceState:(state,unused,next)=>{location.href=String(next)}},
    matchMedia:()=>({matches:false}),window:{print(){printed++}},
    addEventListener:(name,callback)=>windowEvents.set(name,callback),
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id),
    fetch:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});if(path.endsWith('/estado')&&interrupted){interrupted=false;throw new Error('Temporary network failure')}
      if(path.endsWith('/metodo')) {const method=JSON.parse(options.body).method;response={...response,paymentMethod:method,amountMinor:method==='mercado_pago'?1_100_000:1_000_000,attemptId:'00000000-0000-4000-8000-000000000002'}}
      const snapshot=JSON.parse(JSON.stringify(response))
      if(path.endsWith('/estado')&&holdFirstStatus){holdFirstStatus=false;await new Promise(resolve=>{releasePending=resolve})}
      return {ok:true,json:async()=>path.endsWith('/checkout')?{checkoutUrl:snapshot.checkoutUrl,amountMinor:snapshot.amountMinor}:snapshot}},
  }
  vm.runInNewContext(source,context)
  return {ids,events,windowEvents,document,storage,location,calls,
    get printed(){return printed},set response(value){response={...response,...value}},interrupt(){interrupted=true},release(){releasePending?.()},
    async tick(){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(next,'automatic refresh must remain scheduled');timers.delete(next[0]);now=next[1].at;next[1].fn();await flush()},
  }
}

test('registration starts polling without a click, keeps waiting beyond 100s, and updates to QR automatically',async()=>{
  const app=browser()
  app.events.get('workshop:registered')({detail:{reference:'TestReference123',payment:'mercado_pago',paymentStatus:'pending',status:'pending',paymentAccessToken:'a'.repeat(43),baseAmountMinor:1_000_000,amountMinor:1_100_000,localTest:true}})
  await flush()
  assert.equal(app.calls[0].path,'/api/taller/pagos/checkout')
  app.interrupt()
  for(let i=0;i<26;i++) await app.tick()
  assert.equal(app.calls.filter(call=>call.path.endsWith('/estado')).length,26)
  assert.equal(app.ids.get('registration-result').dataset.state,'pending')
  app.response={status:'approved',registrationStatus:'confirmed',emailStatus:'sent',accreditation:{qrDataUrl:'data:image/png;base64,iVBORw0KGgo=',startsAt:'2026-12-19T18:00:00Z',venue:'Parroquia San Luis de Francia'}}
  await app.tick()
  assert.equal(app.ids.get('registration-result').dataset.state,'confirmed')
  assert.equal(app.ids.get('payment-next').hidden,true)
  assert.equal(app.ids.get('pass-qr').hidden,false)
  assert.match(app.ids.get('pass-date').textContent,/15:00 h/)
  assert.equal(app.ids.get('pass-test').hidden,false)
  app.ids.get('print-workshop-pass').handlers.get('click')()
  assert.equal(app.printed,1)
  app.response={status:'refunded',registrationStatus:'review',accreditation:null}
  app.windowEvents.get('focus')()
  await flush()
  assert.equal(app.ids.get('registration-confirmed').hidden,true)
  assert.equal(app.ids.get('pass-qr').src,undefined)
})

test('reload recovers the private receipt, pauses in the background and refreshes on return',async()=>{
  const reference='TestReference123',accessToken='a'.repeat(43)
  const storage=new Map([['vas-workshop-payment:'+reference,JSON.stringify({reference,accessToken,localTest:true})]])
  const app=browser({storage,url:'http://localhost:3000/formacion/pago?reference='+reference})
  await flush()
  assert.equal(app.calls[0].path,'/api/taller/pagos/estado')
  assert.deepEqual(app.calls[0].body,{reference,accessToken})
  assert.ok(!app.location.href.includes(accessToken))
  const before=app.calls.length
  app.document.hidden=true;app.events.get('visibilitychange')()
  app.windowEvents.get('focus')();await flush()
  assert.equal(app.calls.length,before)
  app.document.hidden=false;app.events.get('visibilitychange')();await flush()
  assert.equal(app.calls.length,before+1)
})

test('a delayed request from an older restored receipt cannot block or replace its confirmation',async()=>{
  const reference='TestReference123',accessToken='a'.repeat(43)
  const storage=new Map([['vas-workshop-payment:'+reference,JSON.stringify({reference,accessToken,localTest:true})]])
  const app=browser({storage,url:'http://localhost:3000/formacion/pago?reference='+reference,holdFirstStatus:true})
  app.response={status:'approved',registrationStatus:'confirmed',emailStatus:'sent',accreditation:{qrDataUrl:'data:image/png;base64,iVBORw0KGgo=',startsAt:'2026-12-19T18:00:00Z',venue:'Parroquia San Luis de Francia'}}
  app.windowEvents.get('pageshow')({persisted:true})
  await flush()
  assert.equal(app.ids.get('registration-result').dataset.state,'confirmed')
  app.release();await flush()
  assert.equal(app.ids.get('registration-result').dataset.state,'confirmed')
  assert.equal(app.ids.get('pass-qr').hidden,false)
})

test('only the edit action is visible and another method is saved without repeating the registration',async()=>{
  const reference='TestReference123',accessToken='a'.repeat(43)
  const storage=new Map([['vas-workshop-payment:'+reference,JSON.stringify({reference,accessToken,localTest:true})]])
  const app=browser({storage,url:'http://localhost:3000/formacion/inscripcion?reference='+reference})
  await flush()
  assert.equal(app.ids.has('checkout-verify'),false)
  assert.equal(app.ids.get('checkout-edit').hidden,false)
  await app.ids.get('checkout-edit').handlers.get('click')()
  assert.equal(app.ids.get('checkout-method-editor').hidden,false)
  assert.equal(app.ids.get('checkout-pay').hidden,true)
  app.ids.get('payment-choice-mercado_pago').checked=false
  app.ids.get('payment-choice-bank_transfer').checked=true
  await app.ids.get('checkout-method-editor').handlers.get('submit')({preventDefault(){}})
  assert.equal(app.ids.get('checkout-method-editor').hidden,true)
  assert.equal(app.ids.get('checkout-pay').hidden,true)
  assert.equal(app.ids.get('checkout-proof').hidden,false)
  assert.match(app.ids.get('payment-next-description').textContent,/test.alias/)
  assert.equal(JSON.parse(storage.get('vas-workshop-payment:'+reference)).payment,'bank_transfer')
  assert.equal(app.calls.filter(call=>call.path.endsWith('/metodo')).length,1)
  assert.ok(!app.calls.some(call=>call.path.endsWith('/inscripciones')))
  await app.ids.get('checkout-edit').handlers.get('click')()
  app.ids.get('payment-method-cancel').handlers.get('click')()
  assert.equal(app.calls.filter(call=>call.path.endsWith('/metodo')).length,1,'canceling the selector makes no payment change')
})

test('pay-at-workshop displays and prints a registration card while retaining a visible pending-payment label',async()=>{
  const app=browser()
  app.response={paymentMethod:'on_site',amountMinor:1_000_000,nickname:'Dany',registrationCard:{qrDataUrl:'data:image/png;base64,iVBORw0KGgo=',startsAt:'2026-12-19T18:00:00Z',venue:'Parroquia San Luis de Francia'}}
  await app.events.get('workshop:registered')({detail:{reference:'TestReference123',payment:'on_site',paymentStatus:'pending',status:'pending',paymentAccessToken:'a'.repeat(43),amountMinor:1_000_000,localTest:true}})
  await flush()
  assert.equal(app.ids.get('registration-result').dataset.payment,'pending')
  assert.equal(app.ids.get('registration-result-title').textContent,'Inscripción registrada')
  assert.equal(app.ids.get('pass-qr').hidden,false)
  assert.match(app.ids.get('pass-payment').textContent,/PENDIENTE/)
  assert.equal(app.ids.get('pass-nickname').textContent,'Dany')
  app.ids.get('print-workshop-pass').handlers.get('click')()
  assert.equal(app.printed,1)
  assert.equal(app.calls.filter(call=>call.path.endsWith('/checkout')).length,0)
  await app.ids.get('pass-change-method').handlers.get('click')()
  assert.equal(app.ids.get('checkout-method-editor').hidden,false)
  app.ids.get('payment-method-cancel').handlers.get('click')()
  assert.equal(app.ids.get('checkout-method-editor').hidden,true)
})

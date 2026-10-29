import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../public/device-tilt.js',import.meta.url),'utf8')
const settle = () => new Promise(resolve => setImmediate(resolve))

function browser({secure=true,coarse=true,reduce=false,sensors=true,permission}={}) {
  class Events {
    handlers = new Map()
    addEventListener(type,fn) { if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(fn) }
    removeEventListener(type,fn) { this.handlers.get(type)?.delete(fn) }
    emit(type,event={}) { for(const fn of this.handlers.get(type)||[]) fn(event) }
  }
  class Element extends Events {
    hidden=false;disabled=false;textContent='';isConnected=true
    attrs=new Map();properties=new Map();classes=new Set()
    style={setProperty:(k,v)=>this.properties.set(k,v),removeProperty:k=>this.properties.delete(k)}
    classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)}
    setAttribute(k,v){this.attrs.set(k,v)}
    getClientRects(){return [{}]}
  }
  const window=new Events(),document=new Events(),reduced=new Events(),touch=new Events(),frames=new Map(),observers=[]
  let serial=0,requests=0,gesture=false,requestInGesture=false
  Object.assign(reduced,{matches:reduce});Object.assign(touch,{matches:coarse});Object.assign(document,{hidden:false})
  Object.assign(window,{isSecureContext:secure,screen:{orientation:{angle:0}}})
  if(sensors)window.DeviceOrientationEvent=class {}
  if(permission)window.DeviceOrientationEvent.requestPermission=()=>{requests++;requestInGesture=gesture;return permission()}
  class IntersectionObserver { constructor(fn){this.fn=fn;observers.push(this)} observe(){this.fn([{isIntersecting:true}])} }
  window.IntersectionObserver=IntersectionObserver
  vm.runInNewContext(source,{window,document,matchMedia:q=>q.includes('reduced')?reduced:touch,IntersectionObserver,
    requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id)})
  function mount(options={}){
    const stage=new Element(),card=new Element(),controls=new Element(),button=new Element(),status=new Element()
    controls.querySelector=selector=>selector==='[data-tilt-toggle]'?button:status
    window.VASDeviceTilt.attach(stage,card,{controls,x:'--pass-x',y:'--pass-y',maxX:2.5,maxY:3.5,...options})
    return {stage,card,controls,button,status,click:()=>{gesture=true;button.emit('click');gesture=false}}
  }
  const draw=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())}
  const orient=(beta,gamma)=>window.emit('deviceorientation',{beta,gamma})
  return {window,document,reduced,touch,frames,observers,mount,draw,orient,get requests(){return requests},get requestInGesture(){return requestInGesture}}
}

test('available sensors automatically calibrate, throttle frames and bound the tilt',()=>{
  const app=browser(),pass=app.mount()
  app.orient(35,8);app.draw()
  assert.equal(pass.card.properties.get('--pass-y'),'0.00deg')
  app.orient(45,18);app.orient(150,80)
  assert.equal(app.frames.size,1)
  app.draw()
  assert.equal(pass.card.properties.get('--pass-x'),'-2.50deg')
  assert.equal(pass.card.properties.get('--pass-y'),'3.50deg')
  assert.equal(pass.button.textContent,'Desactivar movimiento')
  pass.click()
  assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
  assert.equal(pass.card.classes.has('device-motion-static'),true)
  app.orient(35,8);assert.equal(app.frames.size,0)
  pass.click();app.orient(35,8);app.draw()
  assert.equal(pass.card.classes.has('device-motion-static'),false)
  assert.equal(pass.card.properties.get('--pass-y'),'0.00deg')
})

test('Safari permission is only requested inside a tap, once while pending',async()=>{
  let finish;const app=browser({permission:()=>new Promise(resolve=>finish=resolve)}),pass=app.mount()
  assert.equal(app.requests,0)
  pass.click();pass.click()
  assert.equal(app.requests,1);assert.equal(app.requestInGesture,true);assert.equal(pass.button.disabled,true)
  finish('granted');await settle()
  assert.equal(pass.button.disabled,false)
  assert.equal(pass.button.attrs.get('aria-pressed'),'true')
  app.orient(30,0);app.draw();app.orient(35,10);app.draw()
  assert.equal(pass.card.classes.has('sensor-is-tilting'),true)
})

test('denied or failed permission leaves the card usable and static',async()=>{
  for(const permission of [()=>Promise.resolve('denied'),()=>Promise.reject(new Error('Denied'))]){
    const app=browser({permission}),pass=app.mount()
    pass.click();await settle();app.orient(30,10);app.draw()
    assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
    assert.equal(pass.button.disabled,false)
    assert.equal(pass.button.attrs.get('aria-pressed'),'false')
    assert.equal(pass.status.hidden,false)
  }
})

test('unsupported, insecure, desktop and reduced-motion contexts never request sensors',()=>{
  for(const options of [{sensors:false},{secure:false},{coarse:false},{reduce:true}]){
    const app=browser(options),pass=app.mount()
    pass.click();app.orient(30,10);app.draw()
    assert.equal(app.requests,0);assert.equal(app.frames.size,0)
    assert.equal(pass.controls.hidden,true)
    assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
  }
})

test('hidden pages, reduced motion and printing cancel pending motion and recalibrate on return',()=>{
  const app=browser(),pass=app.mount()
  app.orient(30,0);app.draw();app.orient(40,10)
  app.document.hidden=true;app.document.emit('visibilitychange')
  assert.equal(app.frames.size,0);assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
  app.document.hidden=false;app.document.emit('visibilitychange');app.orient(70,20);app.draw()
  assert.equal(pass.card.properties.get('--pass-y'),'0.00deg')
  app.reduced.matches=true;app.reduced.emit('change');app.orient(40,10)
  assert.equal(app.frames.size,0);assert.equal(pass.controls.hidden,true)
  app.reduced.matches=false;app.reduced.emit('change');app.orient(40,10);app.draw()
  app.window.emit('beforeprint');assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
  app.window.emit('afterprint');app.orient(60,20);app.draw()
  assert.equal(pass.card.properties.get('--pass-y'),'0.00deg')
})

test('touching the QR freezes it; inactive cards and invalid readings do not move',()=>{
  let active=true;const app=browser(),pass=app.mount({ignore:'.workshop-pass__qr',isActive:()=>active})
  app.orient(null,NaN);app.orient(Infinity,0);app.orient(30,91);assert.equal(app.frames.size,0)
  app.orient(30,0);app.draw()
  pass.stage.emit('pointerdown',{target:{closest:()=>({})}})
  assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
  assert.equal(pass.card.classes.has('device-motion-static'),true)
  app.orient(35,10);assert.equal(app.frames.size,0)
  pass.stage.emit('pointerup');app.orient(50,20);app.draw()
  assert.equal(pass.card.classes.has('device-motion-static'),false)
  assert.equal(pass.card.properties.get('--pass-y'),'0.00deg')
  active=false;app.window.VASDeviceTilt.refresh();app.orient(45,15)
  assert.equal(app.frames.size,0);assert.equal(pass.card.classes.has('sensor-is-tilting'),false)
})

test('landscape rotation recalibrates and maps motion to screen axes',()=>{
  const app=browser(),pass=app.mount()
  app.orient(30,0);app.draw()
  app.window.screen.orientation.angle=90;app.window.emit('orientationchange')
  app.orient(30,0);app.draw();app.orient(40,0);app.draw()
  assert.ok(Math.abs(Number.parseFloat(pass.card.properties.get('--pass-x'))) < 0.01)
  assert.equal(pass.card.properties.get('--pass-y'),'1.40deg')
})

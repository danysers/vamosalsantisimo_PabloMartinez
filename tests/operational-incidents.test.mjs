import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { incidentSchema } from '../lib/incident-policy.ts'
const source=await readFile(new URL('../public/operational-errors.js',import.meta.url),'utf8')
const id='00000000-0000-4000-8000-000000000001'
const flush=()=>new Promise(resolve=>setImmediate(resolve))

test('incident schema rejects arbitrary messages, personal fields, stacks, URLs and unbounded metadata',()=>{
  const valid={correlationId:id,operation:'proof_upload',code:'upload_network',fileSize:2048,fileType:'image/jpeg',outcome:'missing'}
  assert.equal(incidentSchema.safeParse(valid).success,true)
  for(const extra of [{message:'private text'},{stack:'private stack'},{url:'https://example.invalid/#private'},
    {filename:'private-name.jpg'},{email:'person@example.invalid'},{token:'private'},{fileSize:1e12},{httpStatus:200},{operation:'arbitrary'},{code:'private text'}])
    assert.equal(incidentSchema.safeParse({...valid,...extra}).success,false)
})
function browser(storage=new Map(),online=false) {
  const listeners=new Map(),requests=[],timers=new Map();let next=0
  const navigator={onLine:online}
  const window={crypto:{randomUUID:()=>id}}
  vm.runInNewContext(source,{window,navigator,location:{pathname:'/formacion/comprobante'},Date,Math,JSON,AbortController,
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    setTimeout:(f,d)=>{const i=++next;timers.set(i,{f,d});return i},clearTimeout:i=>timers.delete(i),
    addEventListener:(name,fn)=>listeners.set(name,fn),
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,status:202}},
  })
  return {window,navigator,listeners,storage,requests}
}
test('offline diagnostics are bounded, survive reload without capabilities and ignore exception contents',async()=>{
  const storage=new Map(),app=browser(storage)
  app.window.VASErrors.report({operation:'proof_upload',code:'upload_network',outcome:'missing',fileType:'image/jpeg',fileSize:100},
    {reference:'TestReference123',token:'secret-capability'})
  app.listeners.get('error')({error:new Error('person@example.invalid secret-document'),filename:'https://example.invalid/#secret'})
  assert.equal(app.requests.length,0)
  const saved=storage.get('vas-operational-events-v1')
  assert.doesNotMatch(saved,/secret|person@example|filename|message|stack|TestReference/)
  assert.equal(JSON.parse(saved).length,2)
  const reloaded=browser(storage,true);await flush();await flush()
  assert.equal(reloaded.requests.length,1)
  assert.equal(reloaded.requests[0].url,'/api/taller/incidencias')
  assert.equal(reloaded.requests[0].body.access,undefined)
  assert.equal(reloaded.requests[0].body.correlationId,id)
})
test('repeated browser errors are deduplicated and never recursively report the collector itself',async()=>{
  const app=browser(new Map(),true)
  for(let i=0;i<10;i++)app.listeners.get('unhandledrejection')({reason:'private text'})
  await flush()
  assert.equal(app.requests.length,1)
  assert.equal(app.requests[0].body.code,'unhandled_rejection')
  assert.doesNotMatch(JSON.stringify(app.requests),/private text/)
})

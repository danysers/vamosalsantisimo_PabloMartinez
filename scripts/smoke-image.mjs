import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const image = process.argv[2]
if (!image) throw new Error('Provide the built image tag')
const prefix = 'vas-smoke-' + randomUUID().slice(0, 8)
const db = prefix + '-db', publicApp = prefix + '-public', panel = prefix + '-panel'
const trafficVolume = prefix + '-traffic-state'
const password = randomUUID(), secret = randomUUID() + randomUUID()
const docker = (...args) => execFileSync('docker', args, { encoding:'utf8', stdio:['ignore','pipe','pipe'], windowsHide:true }).trim()
const pause = () => new Promise(resolve=>setTimeout(resolve,500))
async function waitReady(base, path) {
  for (let i=0;i<120;i++) {
    try { if ((await fetch(base+path)).status===200) return } catch {}
    await pause()
  }
  throw new Error('Runtime image did not become ready')
}
function port(name) {
  return 'http://localhost:' + JSON.parse(docker('inspect',name))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort
}
try {
  docker('network','create',...(process.env.SMOKE_NETWORK_SUBNET ? ['--subnet',process.env.SMOKE_NETWORK_SUBNET] : []),prefix)
  docker('run','--rm','-d','--name',db,'--network',prefix,'-e',`POSTGRES_PASSWORD=${password}`,'postgres:16-alpine')
  let ready=false
  for(let i=0;i<60;i++) { try { docker('exec',db,'pg_isready','-U','postgres');ready=true;break } catch { await pause() } }
  assert.ok(ready,'temporary PostgreSQL unavailable')
  const shared=['--network',prefix,'-p','127.0.0.1::3000','-e',`DATABASE_URL=postgres://postgres:${password}@${db}:5432/postgres`,
    '-e','WORKSHOP_EVENT_SLUG=formacion-catolica-2026','-e',`WORKSHOP_CHECKOUT_TOKEN_KEY=${secret}`]
  docker('run','--rm','-d','--name',publicApp,...shared,'-e','APP_SURFACE=public','-e','WORKSHOP_RUN_MIGRATIONS=1',
    '-e','TRAFFIC_GUARD_ENABLED=1','-e','TRAFFIC_GUARD_MEMINFO_PATH=/app/.next/cache/traffic-guard/smoke-meminfo',
    '--mount',`type=volume,source=${trafficVolume},target=/app/.next/cache/traffic-guard`,image)
  const publicBase=port(publicApp)
  await waitReady(publicBase,'/')
  for(const path of ['/formacion','/donaciones','/_next/image?url=%2F2026%2Flogo.webp&w=128&q=75']) {
    assert.equal((await fetch(publicBase+path)).status,200,path)
  }
  assert.equal((await fetch(publicBase+'/admin')).status,404)
  // Simulate host pressure with a private fixture; never allocate real memory
  // or call a real payment/email service to verify overload protection.
  const setMemory = value => docker('exec',publicApp,'node','-e',
    `require('node:fs').writeFileSync('/app/.next/cache/traffic-guard/smoke-meminfo','MemTotal: 1000000 kB\\nMemAvailable: ${value} kB\\n')`)
  setMemory(90000)
  await new Promise(resolve=>setTimeout(resolve,1200))
  const held=await fetch(publicBase+'/')
  assert.equal(held.status,503)
  assert.equal(held.headers.get('retry-after'),'30')
  assert.match(await held.text(),/Estamos preparando/)
  for(const path of ['/formacion/pago','/formacion/comprobante','/api/taller/configuracion','/traffic-wait.js']) {
    assert.equal((await fetch(publicBase+path)).status,200,'must remain available during overload: '+path)
  }
  setMemory(200000)
  await new Promise(resolve=>setTimeout(resolve,1200))
  assert.equal((await fetch(publicBase+'/')).status,200)
  const alertCheck=`import {checkMemoryAlert} from './scripts/traffic-monitor.mjs';
    const result=await checkMemoryAlert({root:'/app/.next/cache/traffic-guard',memory:{usedPercent:91,totalBytes:1024000000,availableBytes:92160000},
      send:async()=>{},logger:{info(){},error(){}}});if(result!=='sent')throw Error('Cannot persist non-root alert state');`
  docker('exec',publicApp,'node','--input-type=module','-e',alertCheck)
  docker('exec',publicApp,'node','--input-type=module','-e',alertCheck.replace('send:async()=>{}', 'send:async()=>process.exit(2)')
    .replace("result!=='sent'", "result!=='cooldown'"))
  docker('run','--rm','-d','--name',panel,...shared,'-e','APP_SURFACE=panel','-e','BETTER_AUTH_URL=http://localhost:3000',
    '-e',`BETTER_AUTH_SECRET=${secret}`,image)
  const panelBase=port(panel)
  await waitReady(panelBase,'/admin')
  assert.equal((await fetch(panelBase+'/formacion')).status,404)
  const login=await fetch(panelBase+'/api/auth/sign-in/username',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},
    body:JSON.stringify({username:'nonexistent_smoke_user',password:'invalid-test-password'})})
  assert.equal(login.status,401,'auth runtime must load successfully and reject invalid credentials')
  const check=`const fs=require('node:fs');if(fs.existsSync('/bin/sh')||fs.existsSync('/usr/local/bin/npm'))throw Error('Unexpected runtime tools');
    if(process.getuid()===0)throw Error('Unexpected root user');
    Promise.all(['email-worker','email-bounce-worker','drive-proof-worker','sponsor-sync-worker','traffic-monitor'].map(x=>import('./scripts/'+x+'.mjs'))).then(()=>console.log('Runtime and workers OK'));`
  docker('exec',panel,'/usr/local/bin/node','--experimental-strip-types','-e',check)
  console.log('Image smoke passed: migrations, public pages, memory admission/recovery, persistent alert cooldown, native images, auth, workers, non-root and no shell/npm.')
} finally {
  for(const name of [panel,publicApp,db]) { try { docker('rm','-f',name) } catch {} }
  try { docker('volume','rm',trafficVolume) } catch {}
  try { docker('network','rm',prefix) } catch {}
}

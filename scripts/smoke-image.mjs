import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const image = process.argv[2]
if (!image) throw new Error('Provide the built image tag')
const prefix = 'vas-smoke-' + randomUUID().slice(0, 8)
const db = prefix + '-db', publicApp = prefix + '-public', panel = prefix + '-panel'
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
  docker('run','--rm','-d','--name',publicApp,...shared,'-e','APP_SURFACE=public','-e','WORKSHOP_RUN_MIGRATIONS=1',image)
  const publicBase=port(publicApp)
  await waitReady(publicBase,'/')
  for(const path of ['/formacion','/donaciones','/_next/image?url=%2F2026%2Flogo.webp&w=128&q=75']) {
    assert.equal((await fetch(publicBase+path)).status,200,path)
  }
  assert.equal((await fetch(publicBase+'/admin')).status,404)
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
    Promise.all(['email-worker','drive-proof-worker','sponsor-sync-worker'].map(x=>import('./scripts/'+x+'.mjs'))).then(()=>console.log('Runtime and workers OK'));`
  docker('exec',panel,'/usr/local/bin/node','--experimental-strip-types','-e',check)
  console.log('Image smoke passed: migrations, public pages, native image processing, auth, worker imports, non-root and no shell/npm.')
} finally {
  for(const name of [panel,publicApp,db]) { try { docker('rm','-f',name) } catch {} }
  try { docker('network','rm',prefix) } catch {}
}

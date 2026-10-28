import fs from 'node:fs/promises'

const repository = 'danysers/vamosalsantisimo-pablomartinez'
const image = 'ghcr.io/' + repository + ':latest'
export async function advanceRelease(state, digest, notify) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) throw new Error('Invalid registry digest')
  if (state.deployedDigest === digest) return false
  await notify()
  state.deployedDigest = digest
  state.deployedAt = new Date().toISOString()
  return true
}

async function run() {
  const webhook = new URL(process.env.RELEASE_DEPLOY_URL)
  if (webhook.protocol !== 'http:' || webhook.hostname !== 'overlay_dokploy' || webhook.port !== '3000' || !webhook.pathname.startsWith('/api/deploy/')) throw new Error('Unexpected internal deployment target')
  const filename = '/state/release.json'
  await fs.mkdir('/state', { recursive:true })
  let state
  try { state = JSON.parse(await fs.readFile(filename, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = {} }
  for (;;) {
    try {
      const tokenResponse = await fetch('https://ghcr.io/token?service=ghcr.io&scope=repository:' + repository + ':pull', { signal:AbortSignal.timeout(10000) })
      if (!tokenResponse.ok) throw new Error('Registry token unavailable')
      const { token } = await tokenResponse.json()
      const response = await fetch('https://ghcr.io/v2/' + repository + '/manifests/latest', {
        headers:{ Authorization:'Bearer ' + token, Accept:'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json' }, signal:AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error('Registry manifest unavailable')
      await response.body?.cancel()
      const changed = await advanceRelease(state, response.headers.get('docker-content-digest'), async () => {
        const r = await fetch(webhook, { method:'POST', headers:{'Content-Type':'application/json','x-github-event':'registry_package'},
          body:JSON.stringify({registry_package:{package_version:{package_url:image,container_metadata:{tag:{name:'latest'}}}}}), signal:AbortSignal.timeout(15000) })
        await r.body?.cancel()
        if (!r.ok) throw new Error('Internal deployment request rejected')
      })
      state.checkedAt = new Date().toISOString()
      state.healthy = true
      await fs.writeFile(filename + '.tmp', JSON.stringify(state), { mode:0o600 })
      await fs.rename(filename + '.tmp', filename)
      if (changed) console.log('Published image queued for deployment: ' + state.deployedDigest)
    } catch { console.error('Release check deferred; running website left in place') }
    await new Promise(resolve => setTimeout(resolve, 30000))
  }
}
if (process.env.RELEASE_DEPLOY_URL) await run()

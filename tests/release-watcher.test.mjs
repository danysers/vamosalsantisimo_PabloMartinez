import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceRelease } from '../deploy/production-release-watcher.mjs'
import { renderProductionCompose } from '../deploy/render-production-compose.mjs'

test('a release is recorded only after deployment is accepted and repeated checks do not redeploy', async () => {
  const state={}, digest='sha256:'+'a'.repeat(64)
  let calls=0
  await assert.rejects(advanceRelease(state,digest,async()=>{throw Error('unavailable')}))
  assert.equal(state.deployedDigest,undefined)
  assert.equal(await advanceRelease(state,digest,async()=>{calls++}),true)
  assert.equal(await advanceRelease(state,digest,async()=>{calls++}),false)
  assert.equal(calls,1)
  await assert.rejects(advanceRelease(state,'untrusted',async()=>{calls++}))
  assert.equal(calls,1)
})

test('release watcher uses only an internal webhook, bounded resources and persistent state', async () => {
  const compose=await renderProductionCompose()
  assert.match(compose,/release_state:\/state/)
  assert.match(compose,/  release_state:\n/)
  assert.match(compose,/overlay_dokploy-network-v2/)
  assert.match(compose,/mem_limit: 128m/)
  assert.doesNotMatch(compose,/docker\.sock|x-api-key/)
})

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
// Verify the active graph first. The virtual store may retain old directories
// after a local install, even when no dependency resolves to them.
const snapshots = readFileSync('pnpm-lock.yaml', 'utf8').split(/^snapshots:\s*$/m)[1]
const versions = [...snapshots.matchAll(/^ {2}['"]?picomatch@([^(:'"]+)([^:'"]*)['"]?:/gm)]
assert.deepEqual(versions.map(([, version]) => version).sort(), ['2.3.2', '4.0.7'])
assert.ok(versions.every(([, , suffix]) => /^\(patch_hash=[a-f0-9]{64}\)$/.test(suffix)))

const store = resolve('node_modules/.pnpm')
const entries = readdirSync(store)

for (const [, version] of versions) {
  const copies = entries.filter(name => name.startsWith(`picomatch@${version}_patch_hash=`))
  assert.equal(copies.length, 1, `Expected one patched picomatch ${version} in the virtual store`)
  const [copy] = copies
  const match = require(join(store, copy, 'node_modules/picomatch'))
  assert.equal(match('app/**/*.{ts,tsx}')('app/admin/page.tsx'), true)
  assert.equal(match('app/**/*.{ts,tsx}')('app/admin/page.js'), false)
  for (const pattern of ['@(draft|published)', '+(draft|published)']) {
    const options = { noext: false, noextglob: false }
    assert.ok(!match.parse(pattern, options).tokens.some(token => token.extglob))
    assert.equal(match(pattern, options)('draft'), false)
  }
  console.log(`Checked restricted glob parser: ${copy}`)
}

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

// HTTP tests start Next.js in production mode. Build in an isolated directory so
// they never read a stale .next tree or replace the user's running local preview.
const distDir = '.next-test'
const env = { ...process.env, NEXT_DIST_DIR: distDir }

function run(args) {
  const result = spawnSync(process.execPath, args, {
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.signal) {
    process.stderr.write(`Test command ended with signal ${result.signal}.\n`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['node_modules/next/dist/bin/next', 'build'])

const tests = readdirSync('tests')
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`)

run(['--experimental-strip-types', '--test', ...tests])

import { readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Docker assembly only. Next and the workers run prebuilt code and Node's
// native TypeScript stripping; the optional Drizzle CLI is not a runtime API.
const root = '/app/node_modules'
if (resolve(process.cwd()) !== '/app') throw new Error('Run only in the Docker assembly stage')
for (const entry of await readdir(join(root, '.pnpm'))) {
  if (/^(?:@esbuild\+|@esbuild-kit\+|esbuild@|drizzle-kit@)/.test(entry)) {
    await rm(join(root, '.pnpm', entry), { recursive: true, force: true })
  }
}
for (const entry of ['esbuild', 'drizzle-kit', '.bin/esbuild', '.bin/drizzle-kit']) {
  await rm(join(root, entry), { recursive: true, force: true })
}

import fs from 'node:fs/promises'
export async function renderProductionCompose() {
  const base = (await fs.readFile(new URL('./production-backups.compose.yml', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  const source = (await fs.readFile(new URL('./production-release-watcher.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n').replaceAll('$', '$$')
  const service = [
    '  release:',
    '    image: node:22-alpine',
    '    restart: unless-stopped',
    "    cpus: '0.10'",
    '    mem_limit: 128m',
    '    environment:',
    '      RELEASE_DEPLOY_URL: ${RELEASE_DEPLOY_URL:?Set the internal application deployment webhook}',
    '      NODE_OPTIONS: --max-old-space-size=64',
    '    command: ' + JSON.stringify(['node', '--input-type=module', '-e', source]),
    '    volumes: [release_state:/state]',
    '    networks: [control]',
    '    healthcheck:',
    '      test: ' + JSON.stringify(['CMD','node','-e',"const fs=require('fs');const s=JSON.parse(fs.readFileSync('/state/release.json'));process.exit(s.healthy && Date.now()-Date.parse(s.checkedAt)<180000?0:1)"]),
    '      interval: 30s',
    '      timeout: 5s',
    '      start_period: 60s',
    '      retries: 3',
    '',
  ].join('\n')
  return base.replace('\nvolumes:', '\n' + service + 'volumes:').replace('\n  backups:\nnetworks:', '\n  backups:\n  release_state:\nnetworks:') + '\n  control:\n    name: overlay_dokploy-network-v2\n    external: true\n'
}

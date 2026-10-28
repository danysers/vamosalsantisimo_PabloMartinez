import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const files = ['schedule.mjs', 'worker.mjs', 'config.json']
const commands = [
  'set -eu',
  'cd /opt/alerts',
  ...await Promise.all(files.map(async (file) => {
    const encoded = (await readFile(resolve(directory, file))).toString('base64')
    return `printf '%s' '${encoded}' | base64 -d > ${file}`
  })),
  'if [ ! -f node_modules/nodemailer/package.json ]; then npm install --no-audit --no-fund --save-exact nodemailer@10.2.1; fi',
  'exec node worker.mjs',
]
const compose = `services:
  alerts:
    image: node:22-alpine
    restart: unless-stopped
    init: true
    network_mode: bridge
    working_dir: /opt/alerts
    mem_limit: 192m
    cpus: 0.25
    pids_limit: 64
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      TZ: America/Argentina/Buenos_Aires
      ALERT_STATE_DIR: /var/lib/vas-alerts
      ALERT_TO: \${ALERT_TO:?Missing ALERT_TO}
      ALERT_SEND_SETUP: '1'
      SMTP_HOST: \${SMTP_HOST:?Missing SMTP_HOST}
      SMTP_PORT: '465'
      SMTP_USER: \${SMTP_USER:?Missing SMTP_USER}
      SMTP_PASS: \${SMTP_PASS:?Missing SMTP_PASS}
      SMTP_FROM: \${SMTP_FROM:?Missing SMTP_FROM}
    volumes:
      - alerts_runtime:/opt/alerts
      - alerts_state:/var/lib/vas-alerts
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
${commands.map((command) => `        ${command}`).join('\n')}
    healthcheck:
      test: ["CMD", "node", "/opt/alerts/worker.mjs", "--health"]
      start_period: 120s
      interval: 60s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: 5m
        max-file: '3'
volumes:
  alerts_runtime:
  alerts_state:
`
await writeFile(resolve(directory, 'compose.generated.yaml'), compose)
process.stdout.write('Generated isolated alert service; no secrets included.\n')

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Keep dependency resolution bounded on the shared, 2-vCPU Dokploy host.
# Cache the pnpm store so an interrupted build does not download everything again.
RUN --mount=type=cache,id=vas-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --network-concurrency=4 --child-concurrency=1 --store-dir=/pnpm/store

FROM dependencies AS builder
COPY . .
ENV NEXT_BUILD_CPUS=1 NODE_OPTIONS=--max-old-space-size=3072
RUN pnpm build

FROM dependencies AS production-dependencies
# Reuse the single dependency install instead of running a second registry-heavy install.
RUN --mount=type=cache,id=vas-pnpm-store,target=/pnpm/store \
    CI=true npm_config_store_dir=/pnpm/store npm_config_offline=true pnpm prune --prod

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S -G app app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /app/scripts/seed-workshop.mjs ./scripts/seed-workshop.mjs
COPY --from=builder /app/scripts/email-worker.mjs ./scripts/email-worker.mjs
COPY --from=builder /app/scripts/link-admin-operator.mjs ./scripts/link-admin-operator.mjs
COPY --from=builder /app/lib/accreditation-token.ts ./lib/accreditation-token.ts
COPY --from=builder /app/lib/email-templates.ts ./lib/email-templates.ts
COPY --from=production-dependencies /app/node_modules ./node_modules
USER app
EXPOSE 3000
CMD ["node", "server.js"]

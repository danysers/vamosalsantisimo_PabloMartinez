FROM node:22.23.4-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.27.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=vas-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --network-concurrency=4 --child-concurrency=1 --store-dir=/pnpm/store

FROM dependencies AS build
COPY . .
ENV NEXT_BUILD_CPUS=1 NODE_OPTIONS=--max-old-space-size=3072 RAYON_NUM_THREADS=1
RUN pnpm build

FROM dependencies AS production-dependencies
RUN --mount=type=cache,id=vas-pnpm-store,target=/pnpm/store \
    CI=true npm_config_store_dir=/pnpm/store npm_config_offline=true pnpm prune --prod

FROM node:22.23.4-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/lib/accreditation-token.ts /app/lib/email-templates.ts /app/lib/recovery-code.ts ./lib/
COPY --from=production-dependencies /app/node_modules ./node_modules
USER app
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]

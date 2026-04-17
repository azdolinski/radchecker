ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4444
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# `data/` is user configuration and is bind-mounted at runtime (see docs/notes/devops.md).
# The app creates the required skeleton on startup via instrumentation.ts.
# `radius` is declared in serverExternalPackages and resolves its dictionary
# files via __dirname at runtime, so the package must exist on disk.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/radius ./node_modules/radius

USER nextjs
EXPOSE 4444
VOLUME ["/app/data"]
CMD ["node", "server.js"]

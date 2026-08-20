# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install dependencies against the lockfile only, for cacheable layers.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build the standalone Next.js server.
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Migrator image: retains the full dependency tree and Prisma CLI so a release
# step (job / init container / PaaS pre-deploy) can run `prisma migrate deploy`.
# Build with: docker build --target migrator -t gather-migrator .
FROM builder AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

# Minimal runtime image: the standalone server only. The Prisma query engine is
# traced into the standalone output; migrations are applied by the migrator image
# or `npm run db:deploy` as a release step, never by an app replica.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

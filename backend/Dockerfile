# WareTrace backend API — Node 20 + Express 5 + Prisma 6.
#   docker build -t waretrace-backend ./backend
# The entrypoint applies pending migrations (prisma migrate deploy) and then
# starts the server. It never seeds; run the seed scripts explicitly.

# ─── Build: install dependencies and generate the Prisma client ──────────────
FROM node:20-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
# Dev dependencies are kept on purpose: the Prisma CLI (a devDependency) runs
# `migrate deploy` at container start.
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim
# Prisma's query engine (binary target debian-openssl-3.0.x) links against OpenSSL 3.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
# storage/ holds QR images, alert snapshots and uploaded videos (mount a volume).
RUN mkdir -p storage && chown node:node storage && chmod +x docker-entrypoint.sh

USER node
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

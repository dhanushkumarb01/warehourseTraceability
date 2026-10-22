# WareTrace frontend — Vite build served by unprivileged nginx on :8080.
#   docker build --build-arg VITE_API_BASE_URL=http://localhost:5000/api -t waretrace-frontend ./frontend
# Vite bakes VITE_API_BASE_URL into the bundle, so it is a build argument:
# rebuild the image to point it at a different API.

# ─── Build ───────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG VITE_API_BASE_URL=http://localhost:5000/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

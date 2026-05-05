# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache optimization)
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ─── Stage 2: Production Runtime ─────────────────────────────────────────────
FROM node:18-alpine AS runtime

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Build args — NEVER pass secrets here; inject at runtime via ECS task env/Secrets Manager
ARG NODE_ENV=production
ARG APP_ENV=prod
ARG BUILD_VERSION=unknown

ENV NODE_ENV=${NODE_ENV} \
    APP_ENV=${APP_ENV} \
    BUILD_VERSION=${BUILD_VERSION} \
    # Vault settings — overridden via ECS task environment at runtime
    VAULT_ENABLED=true \
    VAULT_SECRET_PATH=secret/data/sdlc

# Copy built artifacts and production deps only
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/config ./config

# Copy tickets directory (read-only; ECS can mount EFS for persistence)
COPY --chown=appuser:appgroup tickets/ ./tickets/

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

ENTRYPOINT ["node", "dist/index.js"]

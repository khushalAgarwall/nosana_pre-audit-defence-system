# ─────────────────────────────────────────────────────────────
# Dockerfile — Sentinel Audit Backend
# Optimized for Nosana GPU Network deployment
# ─────────────────────────────────────────────────────────────

# Stage 1: Build
FROM node:23-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY characters/ ./characters/

# Build TypeScript
RUN pnpm run build

# Stage 2: Production
FROM node:23-slim AS production

WORKDIR /app

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod

# Copy built output and character
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/characters/ ./characters/

# Create data directory for SQLite
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup --system sentinel && adduser --system --ingroup sentinel sentinel
RUN chown -R sentinel:sentinel /app
USER sentinel

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/sentinel.db
ENV NOSANA_ENDPOINT=http://localhost:8080/v1
ENV NOSANA_API_KEY=nosana
ENV NOSANA_MODEL=Qwen3.5-9B-FP8

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]

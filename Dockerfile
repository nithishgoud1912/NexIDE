# ============================================================
# NexIDE — Multi-stage Docker Build for Render Free Tier
# ============================================================

# ------ Stage 1: Install dependencies ------
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
COPY prisma/ ./prisma/

RUN npm ci

# ------ Stage 2: Build the Next.js app ------
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (standalone output)
RUN npm run build

# ------ Stage 3: Production runner ------
FROM node:20-slim AS runner

# Install runtime deps for node-pty (native module)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone Next.js output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy the unified server and PTY server
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/pty-server.js ./pty-server.js

# Install ALL production dependencies (socket.io, node-pty, chokidar, prisma, etc.)
# This is more reliable than cherry-picking individual packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/scripts/ ./scripts/
COPY --from=builder /app/prisma/ ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Expose the port (Render sets PORT env var)
EXPOSE 3000

# Start the unified server
CMD ["node", "server.js"]

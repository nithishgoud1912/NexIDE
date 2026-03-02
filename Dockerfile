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

# Install minimal runtime deps for node-pty
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

# Copy Prisma generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy node-pty native bindings
COPY --from=builder /app/node_modules/node-pty ./node_modules/node-pty

# Copy socket.io (needed by unified server)
COPY --from=builder /app/node_modules/socket.io ./node_modules/socket.io
COPY --from=builder /app/node_modules/socket.io-adapter ./node_modules/socket.io-adapter
COPY --from=builder /app/node_modules/socket.io-parser ./node_modules/socket.io-parser
COPY --from=builder /app/node_modules/engine.io ./node_modules/engine.io
COPY --from=builder /app/node_modules/engine.io-parser ./node_modules/engine.io-parser
COPY --from=builder /app/node_modules/ws ./node_modules/ws
COPY --from=builder /app/node_modules/cors ./node_modules/cors
COPY --from=builder /app/node_modules/vary ./node_modules/vary
COPY --from=builder /app/node_modules/object-assign ./node_modules/object-assign
COPY --from=builder /app/node_modules/@socket.io ./node_modules/@socket.io

# Copy chokidar (needed for file watching)
COPY --from=builder /app/node_modules/chokidar ./node_modules/chokidar

# Copy package.json for project type scanning
COPY --from=builder /app/package.json ./package.json

# Expose the port (Render sets PORT env var)
EXPOSE 3000

# Start the unified server
CMD ["node", "server.js"]

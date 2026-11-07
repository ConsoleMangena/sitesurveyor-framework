# ── Stage 1: Build Frontend ──────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy frontend package definitions for efficient caching
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/

# Install exactly the locked dependency tree without running unnecessary native
# addon scripts (e.g. node-usb).
RUN cd apps/web && npm ci --ignore-scripts

# Copy frontend source code
COPY apps/web/ ./apps/web/

# Build arguments for Supabase & Solana integration.
# The Supabase project URL and key have no defaults: a build with neither must
# fail loudly rather than silently talking to someone else's project. Pass them
# with `--build-arg` or through docker-compose (see README).
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_SOLANA_CLUSTER=devnet
ARG VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG VITE_SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
ARG VITE_SOLANA_TREASURY_ADDRESS=

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SOLANA_CLUSTER=$VITE_SOLANA_CLUSTER \
    VITE_SOLANA_RPC_URL=$VITE_SOLANA_RPC_URL \
    VITE_SOLANA_USDC_MINT=$VITE_SOLANA_USDC_MINT \
    VITE_SOLANA_TREASURY_ADDRESS=$VITE_SOLANA_TREASURY_ADDRESS

# Fail the build early when the Supabase configuration is missing. Vite would
# otherwise emit a bundle that throws at runtime on the first Supabase call.
RUN test -n "$VITE_SUPABASE_URL" || (echo "VITE_SUPABASE_URL build arg is required" >&2; exit 1)
RUN test -n "$VITE_SUPABASE_ANON_KEY" || (echo "VITE_SUPABASE_ANON_KEY build arg is required" >&2; exit 1)

# Build frontend production bundle
RUN cd apps/web && npm run build

# ── Stage 2: Production Web Server ──────────────────────────────
FROM nginx:alpine AS runner

# Copy custom Nginx SPA configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

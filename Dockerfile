# ── Stage 1: Build Frontend ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and frontend package definitions for efficient caching
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install frontend dependencies
RUN cd frontend && npm install

# Copy frontend source code
COPY frontend/ ./frontend/

# Build arguments for Supabase & Solana integration
ARG VITE_SUPABASE_URL=https://csjjmuexzuewqnopzbik.supabase.co
ARG VITE_SUPABASE_ANON_KEY=sb_publishable_Ff8dzgN6UUKGIArhIN4UtA_Gye7Wx9C
ARG VITE_SOLANA_CLUSTER=devnet
ARG VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG VITE_SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
ARG VITE_SOLANA_TREASURY_ADDRESS=EopjFKFe77fHk2yty4h95TR4rPNH44fhBKhWHJiAwgTy

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SOLANA_CLUSTER=$VITE_SOLANA_CLUSTER \
    VITE_SOLANA_RPC_URL=$VITE_SOLANA_RPC_URL \
    VITE_SOLANA_USDC_MINT=$VITE_SOLANA_USDC_MINT \
    VITE_SOLANA_TREASURY_ADDRESS=$VITE_SOLANA_TREASURY_ADDRESS

# Build frontend production bundle (CAD/GDAL heavy features remain desktop-only via platform stubs)
RUN cd frontend && npm run build

# ── Stage 2: Production Web Server ──────────────────────────────
FROM nginx:alpine AS runner

# Copy custom Nginx SPA configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

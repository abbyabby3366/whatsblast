FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies including git
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json* ./
COPY client/package.json client/package-lock.json* ./client/

# Install root dependencies
RUN npm install

# Install client dependencies
RUN cd client && npm install --legacy-peer-deps

# Copy source files
COPY . .

# Build client static bundle and compile backend TypeScript
RUN npm run build

# --- Production Stage ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime utilities including git
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json* ./
COPY client/package.json client/package-lock.json* ./client/

# Copy installed node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/node_modules ./client/node_modules

# Copy compiled dist and client build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Create folders for runtime sessions and file uploads
RUN mkdir -p /app/sessions /app/uploads

EXPOSE 3000

CMD ["node", "dist/index.js"]

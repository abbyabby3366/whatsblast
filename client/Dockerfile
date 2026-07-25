FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_BACKEND_URL=https://whatsblasting.jona.my/api/
ARG SERVER_URL=https://whatsblasting.jona.my/
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL} \
    SERVER_URL=${SERVER_URL} \
    HOST=0.0.0.0 \
    PORT=25433

EXPOSE 25433

# TanStack Start currently builds an SSR bundle in this app, so the container
# runs Vite's host-bound app server. Nginx reverse-proxies to this service.
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "25433"]

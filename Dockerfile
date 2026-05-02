# Stage 1: Build the Vite React application
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
	&& npm config set fetch-retry-factor 2 \
	&& npm config set fetch-retry-mintimeout 20000 \
	&& npm config set fetch-retry-maxtimeout 120000 \
	&& npm config set fetch-timeout 300000 \
	&& for i in 1 2 3; do npm ci && break; echo "npm ci failed on attempt $i"; if [ "$i" -eq 3 ]; then exit 1; fi; done

COPY . .
RUN npm run build

# Stage 2: Runtime image (Node server serves both static frontend and API proxy)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV HTTPS_PORT=8443
ENV DATA_DIR=/data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /data

EXPOSE 8787 8443

# Required at runtime:
#   - AI_PROVIDER: which AI provider to use (default: github)
#   - GITHUB_MODELS_TOKEN: required when AI_PROVIDER=github (default)
#   - See .env.example for other provider-specific env vars
# HTTPS is enabled by default with a generated self-signed certificate.
CMD ["node", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", "server/index.mjs"]

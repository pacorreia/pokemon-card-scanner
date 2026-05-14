# Stage 1: Build the Vite React application
FROM node:22-alpine AS builder

WORKDIR /app

# canvas is an optionalDependency (used only for tests). It has no musl prebuilts and requires
# native compilation — without build tools present it fails gracefully and is silently skipped.
# All other optional deps (e.g. @rollup/rollup-linux-x64-musl) install fine from prebuilts.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

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

# Create data directory and give ownership to the built-in non-root 'node' user
RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 8787 8443

# Required at runtime:
#   - AI_PROVIDER: which AI provider to use (default: github)
#   - Provider-specific env vars matching AI_PROVIDER — e.g.:
#       GITHUB_MODELS_TOKEN              (when AI_PROVIDER=github)
#       OPENAI_API_KEY                   (when AI_PROVIDER=openai)
#       GROQ_API_KEY                     (when AI_PROVIDER=groq)
#       ANTHROPIC_API_KEY                (when AI_PROVIDER=anthropic)
#       AZURE_OPENAI_URL + AZURE_OPENAI_API_KEY (when AI_PROVIDER=azure)
#       OLLAMA_BASE_URL                  (when AI_PROVIDER=ollama, no token needed)
#   - See .env.example for all provider-specific env vars
# HTTPS is enabled by default with a generated self-signed certificate.
CMD ["node", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", "server/index.mjs"]

# Stage 1: Build the Vite React application
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

ARG VITE_GITHUB_CLIENT_ID
ENV VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID

COPY . .
RUN npm run build

# Stage 2: Runtime image (Node server serves both static frontend and API proxy)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

RUN mkdir -p /data

EXPOSE 8787

# Required at runtime:
#   - GITHUB_MODELS_TOKEN: token used by server-side GitHub Models proxy
CMD ["node", "--experimental-sqlite", "--no-warnings=ExperimentalWarning", "server/index.mjs"]

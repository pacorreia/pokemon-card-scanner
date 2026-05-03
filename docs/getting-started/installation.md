# Installation

This page covers the different ways to install and run PokéDex Scanner.

## Option 1 — Local development (npm)

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ^20.19.0 or ≥22.12.0 |
| npm | ≥10 |

### Steps

```bash
# Clone the repository
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner

# Install dependencies
npm install

# Copy the example env file
cp .env.example .env
# Edit .env and set AI_PROVIDER plus the matching provider token (e.g. GITHUB_MODELS_TOKEN for the default github provider)
# Note: the npm scripts do not load .env automatically, so load it into your shell first
set -a
. ./.env
set +a

# Start both frontend and API server
npm run dev:full
```

Open <http://localhost:5173>.

### Available npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite frontend dev server only (port 5173) |
| `npm run dev:server` | Start the Node.js API server only (port 8787) |
| `npm run dev:full` | Start both frontend and API server concurrently |
| `npm run build` | Build frontend for production into `dist/` |
| `npm run test` | Run unit tests with Vitest |
| `npm run lint` | Lint source files with ESLint |

## Option 2 — Docker

### Single container (quick)

```bash
# Using the default GitHub Models provider
docker run -d \
  --name pokedex-scanner \
  -e AI_PROVIDER=github \
  -e GITHUB_MODELS_TOKEN="ghp_..." \
  -v pokedex-data:/data \
  -p 8787:8787 \
  ghcr.io/pacorreia/pokemon-card-scanner:latest
```

Open <http://localhost:8787>.

The container serves both the built frontend and the Node.js API on the same port.

### Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  pokedex-scanner:
    image: ghcr.io/pacorreia/pokemon-card-scanner:latest
    restart: unless-stopped
    environment:
      AI_PROVIDER: github
      GITHUB_MODELS_TOKEN: "${GITHUB_MODELS_TOKEN}"
    volumes:
      - pokedex-data:/data
    ports:
      - "8787:8787"

volumes:
  pokedex-data:
```

Then:

```bash
export GITHUB_MODELS_TOKEN="ghp_..."
docker compose up -d
```

See [Docker Deployment](../guides/docker.md) for more details, including HTTPS and API protection options.

## Option 3 — Build from source for production

```bash
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner
npm install
npm run build
```

Static files are written to `dist/`. Start the production server:

```bash
# Example using the default GitHub Models provider
NODE_ENV=production \
AI_PROVIDER=github \
GITHUB_MODELS_TOKEN="ghp_..." \
node --experimental-sqlite --disable-warning=ExperimentalWarning server/index.mjs
```

The server listens on port `8787` (HTTP) and `8443` (HTTPS) by default.

## Data directory

The server stores the Pokémon TCG database (`pokedex.db`) in the directory pointed to by the `DATA_DIR` environment variable (default: `./data` in development, `/data` in Docker). Back this file up if you want to preserve a downloaded database.

# Docker Deployment

PokéDex Scanner ships as a multi-stage Docker image. The final runtime image is based on `node:22-alpine` and serves both the pre-built React frontend and the Node.js API server on a single port.

## Quick start

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

## Docker Compose

```yaml
services:
  pokedex-scanner:
    image: ghcr.io/pacorreia/pokemon-card-scanner:latest
    restart: unless-stopped
    environment:
      AI_PROVIDER: github
      GITHUB_MODELS_TOKEN: "${GITHUB_MODELS_TOKEN}"
      # Optional: protect mutating endpoints with a password
      # API_SECRET: "${API_SECRET}"
    volumes:
      - pokedex-data:/data
    ports:
      - "8787:8787"
      # HTTPS is also available on 8443 (self-signed certificate)
      # - "8443:8443"

volumes:
  pokedex-data:
```

Start:

```bash
export GITHUB_MODELS_TOKEN="ghp_..."
docker compose up -d
```

Stop:

```bash
docker compose down
```

## Available image tags

| Tag | Description |
|---|---|
| `latest` | Latest build from the `main` branch |
| `sha-<short_sha>` | Pinned to a specific commit |

Images are hosted in the [GitHub Container Registry](https://github.com/pacorreia/pokemon-card-scanner/pkgs/container/pokemon-card-scanner).

## Volumes

| Container path | Purpose |
|---|---|
| `/data` | SQLite database (`pokedex.db`) and any downloaded card assets |

!!! tip "Preserve your database"
    Mount `/data` to a named volume or a host directory so the downloaded Pokémon TCG database survives container restarts and upgrades.

## Ports

| Port | Protocol | Description |
|---|---|---|
| `8787` | HTTP | Main application port |
| `8443` | HTTPS | Auto-generated self-signed certificate |

## Environment variables

See [Environment Variables](../configuration/environment.md) for the full list. At minimum, set `AI_PROVIDER` and the required provider-specific variables. See [AI Providers](../configuration/ai-providers.md) for all supported providers and their required variables.

## Building the image locally

```bash
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner
docker build -t pokedex-scanner .
# Using the default GitHub Models provider
docker run -d \
  --name pokedex-scanner \
  -e AI_PROVIDER=github \
  -e GITHUB_MODELS_TOKEN="ghp_..." \
  -v pokedex-data:/data \
  -p 8787:8787 \
  pokedex-scanner
```

## HTTPS configuration

HTTPS is enabled by default on port `8443` with an auto-generated self-signed certificate. For production use behind a reverse proxy (e.g., nginx, Traefik, Caddy), expose only port `8787` and let the proxy handle TLS termination.

!!! note "Reverse proxy X-Forwarded-Proto"
    The server reads the `x-forwarded-proto` header to determine whether the original request was HTTPS. Make sure your proxy sets this header correctly so that cookie `Secure` flags behave as expected.

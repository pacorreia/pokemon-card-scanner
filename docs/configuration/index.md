# Configuration Overview

PokéDex Scanner is configured entirely through environment variables. There are no config files to edit — set variables in your shell, `.env` file, or Docker environment.

## Quick reference

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `github` | Which AI provider to use for card recognition |
| `GITHUB_MODELS_TOKEN` | *(required when `AI_PROVIDER=github`)* | GitHub Personal Access Token |
| `VITE_CARD_ANALYSIS_MODEL` | *(provider default)* | Override the model used for card analysis |
| `PORT` | `8787` | HTTP port for the Node.js server |
| `HTTPS_PORT` | `8443` | HTTPS port for the Node.js server |
| `HTTPS_ENABLED` | `true` | Set to `false` to disable HTTPS |
| `DATA_DIR` | `./data` (dev) / `/data` (Docker) | Directory for the SQLite database |
| `ALLOWED_ORIGIN` | *(empty)* | CORS allowed origin (dev only, when frontend and API run on different ports) |
| `API_SECRET` | *(empty)* | Enable shared-secret authentication for mutating endpoints |
| `SESSION_SECRET` | *(random, ephemeral)* | Signs session tokens — set a stable value in production |

## Configuration files

- **`.env`** — Copy from `.env.example` for local development. Load these variables into your shell or startup command before launching the Node.js server; they are not read automatically by `node server/index.mjs`.
- **`.env.example`** — A fully-commented template listing every available variable with explanations.

## Sections

- [AI Providers](ai-providers.md) — choose and configure your AI backend
- [Environment Variables](environment.md) — full reference for every variable

# Configuration Overview

PokéDex Scanner is configured entirely through environment variables. There are no config files to edit — set variables in your shell, `.env` file, or Docker environment.

## Quick reference

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `github` | Which AI provider to use for card recognition (`github` \| `openai` \| `groq` \| `ollama` \| `azure` \| `anthropic`) |
| `GITHUB_MODELS_TOKEN` | *(required when `AI_PROVIDER=github`)* | GitHub Personal Access Token |
| `OPENAI_API_KEY` | *(required when `AI_PROVIDER=openai`)* | OpenAI API key |
| `GROQ_API_KEY` | *(required when `AI_PROVIDER=groq`)* | Groq API key |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL *(used when `AI_PROVIDER=ollama`)* |
| `AZURE_OPENAI_URL` | *(required when `AI_PROVIDER=azure`)* | Azure OpenAI deployment URL |
| `AZURE_OPENAI_API_KEY` | *(required when `AI_PROVIDER=azure`)* | Azure OpenAI API key |
| `ANTHROPIC_API_KEY` | *(required when `AI_PROVIDER=anthropic`)* | Anthropic API key |
| `VITE_CARD_ANALYSIS_MODEL` | *(provider default)* | Override the model used for card analysis. **Build-time only** (Vite `import.meta.env`) — has no effect on a prebuilt Docker image. Use the Settings UI or `POST /api/settings/ai` for runtime overrides. |
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

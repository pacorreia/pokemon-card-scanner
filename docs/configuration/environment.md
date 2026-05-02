# Environment Variables

Full reference for every environment variable recognised by the PokéDex Scanner server. Copy `.env.example` to `.env` and fill in the values you need.

## AI provider

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `github` | AI provider to use. One of: `github`, `openai`, `groq`, `ollama`, `azure`, `anthropic` |
| `GITHUB_MODELS_TOKEN` | — | GitHub PAT for the `github` provider |
| `OPENAI_API_KEY` | — | API key for the `openai` provider |
| `GROQ_API_KEY` | — | API key for the `groq` provider |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Base URL for the local Ollama instance |
| `AZURE_OPENAI_URL` | — | Full Azure OpenAI deployment URL |
| `AZURE_OPENAI_API_KEY` | — | API key for Azure OpenAI |
| `ANTHROPIC_API_KEY` | — | API key for Anthropic Claude |
| `VITE_CARD_ANALYSIS_MODEL` | *(provider default)* | Override the model name used for card image analysis |

## Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | HTTP port the Node.js server listens on |
| `HTTPS_PORT` | `8443` | HTTPS port; a self-signed certificate is generated automatically |
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `DATA_DIR` | `./data` (dev) / `/data` (Docker) | Directory where `pokedex.db` (SQLite) is stored |

## Security

| Variable | Default | Description |
|---|---|---|
| `API_SECRET` | *(empty)* | When set, all `POST`/`PUT`/`DELETE` requests and `GET /api/db/export` require a valid session cookie obtained via `POST /api/auth/login`. Leave empty for local / trusted-network deployments. |
| `ALLOWED_ORIGIN` | *(empty)* | Allowed CORS origin. Set to the frontend origin (e.g. `http://localhost:5173`) only when the frontend and API run on different origins (typical during `npm run dev:full`). Leave empty for same-origin deployments. |

!!! warning "Keep secrets out of version control"
    Never commit your `.env` file or token values. The `.env` file is already listed in `.gitignore`.

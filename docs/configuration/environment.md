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
| `HTTPS_ENABLED` | `true` | Set to `false` to disable HTTPS entirely (HTTP only) |
| `HOST` | `0.0.0.0` | Bind address for both HTTP and HTTPS servers |
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `DATA_DIR` | `./data` (dev) / `/data` (Docker) | Directory where `pokedex.db` (SQLite) is stored |
| `TLS_DIR` | `<DATA_DIR>/tls` | Directory where TLS certificate files are stored or generated |
| `TLS_KEY_PATH` | `<TLS_DIR>/server.key` | Path to a custom TLS private key (PEM). If absent, a self-signed key is generated. |
| `TLS_CERT_PATH` | `<TLS_DIR>/server.crt` | Path to a custom TLS certificate (PEM). If absent, a self-signed cert is generated. |

## Security

| Variable | Default | Description |
|---|---|---|
| `API_SECRET` | *(empty)* | When set, all `POST`/`PUT`/`DELETE` requests and `GET /api/db/export` require a valid session cookie obtained via `POST /api/auth/login`. Leave empty for local / trusted-network deployments. |
| `SESSION_SECRET` | *(random, ephemeral)* | Secret used to sign session tokens. Set a stable value in production so sessions survive server restarts. |
| `SESSION_TTL_MS` | `604800000` (7 days) | Session token lifetime in milliseconds. |
| `ALLOWED_ORIGIN` | *(empty)* | Allowed CORS origin. Set to the frontend origin (e.g. `http://localhost:5173`) only when the frontend and API run on different origins (typical during `npm run dev:full`). Leave empty for same-origin deployments. |

!!! warning "Keep secrets out of version control"
    Never commit your `.env` file or token values. The `.env` file is already listed in `.gitignore`.

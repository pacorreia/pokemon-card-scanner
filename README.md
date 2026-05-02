# PokéDex Scanner

[![CI](https://github.com/pacorreia/pokemon-card-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/pacorreia/pokemon-card-scanner/actions/workflows/ci.yml)
[![Docs](https://github.com/pacorreia/pokemon-card-scanner/actions/workflows/deploy-docs.yml/badge.svg)](https://pacorreia.github.io/pokemon-card-scanner)
[![License](https://img.shields.io/github/license/pacorreia/pokemon-card-scanner)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js)](https://nodejs.org/)

An AI-powered web application for scanning and managing your Pokémon TCG card collection. Point your camera at a card — the app identifies it automatically using your choice of AI provider, looks it up in a local card database, and adds it to your collection.

📖 **[Full documentation →](https://pacorreia.github.io/pokemon-card-scanner)**

## Features

- 📷 **AI card scanning** — camera or image upload; supports GitHub Models, OpenAI, Groq, Ollama, Azure OpenAI, and Anthropic Claude
- ✍️ **Manual entry** for cards you prefer to add without scanning
- 📦 **Collection management** — organise cards into named collections
- 🔍 **Search & filter** by name, set, type, and rarity
- 📊 **Duplicate tracking** and estimated collection value (EUR)
- 💾 **Import / export** your collection as JSON
- 🗄️ **Offline database** — full Pokémon TCG card database downloaded locally (SQLite)
- 🔐 **Optional API protection** — shared-secret session cookie auth

## Quick Start

```bash
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner
npm install
GITHUB_MODELS_TOKEN="<your_github_pat>" npm run dev:full
```

Open <http://localhost:5173>. On first launch, download the card database when prompted.

> **Get a free GitHub PAT** (no extra scopes needed): <https://github.com/settings/tokens/new?description=Pokemon+Card+Scanner&scopes=>

## Docker

```bash
docker run -d \
  --name pokedex-scanner \
  -e GITHUB_MODELS_TOKEN="<your_github_pat>" \
  -v pokedex-data:/data \
  -p 8787:8787 \
  ghcr.io/pacorreia/pokemon-card-scanner:latest
```

Open <http://localhost:8787>.

## AI Providers

Switch providers by setting `AI_PROVIDER` before starting the server:

| Provider | `AI_PROVIDER` | Required env var |
|---|---|---|
| **GitHub Models** (default) | `github` | `GITHUB_MODELS_TOKEN` |
| **OpenAI** | `openai` | `OPENAI_API_KEY` |
| **Groq** | `groq` | `GROQ_API_KEY` |
| **Ollama** (local) | `ollama` | *(none)* |
| **Azure OpenAI** | `azure` | `AZURE_OPENAI_URL`, `AZURE_OPENAI_API_KEY` |
| **Anthropic Claude** | `anthropic` | `ANTHROPIC_API_KEY` |

Override the model with `VITE_CARD_ANALYSIS_MODEL=<model>` for local development or when rebuilding the frontend. In the published Docker image, the frontend is already built, so changing `VITE_` environment variables at container runtime will not affect `import.meta.env`; use the Settings UI (or `/api/settings/ai`) for production/runtime overrides instead. See [`.env.example`](.env.example) for all options, or the [AI Providers docs](https://pacorreia.github.io/pokemon-card-scanner/configuration/ai-providers/) for examples.

## Building for production

```bash
npm run build
# Static output → dist/

NODE_ENV=production GITHUB_MODELS_TOKEN="..." \
  node --experimental-sqlite --disable-warning=ExperimentalWarning server/index.mjs
```

## Documentation

Full documentation is available at **<https://pacorreia.github.io/pokemon-card-scanner>**, including:

- [Getting Started](https://pacorreia.github.io/pokemon-card-scanner/getting-started/)
- [Installation](https://pacorreia.github.io/pokemon-card-scanner/getting-started/installation/)
- [AI Providers](https://pacorreia.github.io/pokemon-card-scanner/configuration/ai-providers/)
- [Docker Deployment](https://pacorreia.github.io/pokemon-card-scanner/guides/docker/)
- [Development Guide](https://pacorreia.github.io/pokemon-card-scanner/development/)

## License

MIT — Copyright GitHub, Inc.

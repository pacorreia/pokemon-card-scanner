# Quick Start

Get PokéDex Scanner running in under five minutes.

## Prerequisites

- **Node.js** 20.19.0 or later (22.x recommended)
- **npm** 10 or later
- A [GitHub Personal Access Token](https://github.com/settings/tokens/new?description=Pokemon+Card+Scanner&scopes=) (no extra scopes needed) — or an API key from another [supported AI provider](../configuration/ai-providers.md)

## 1. Clone and install

```bash
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner
npm install
```

## 2. Set your AI token

```bash
export GITHUB_MODELS_TOKEN="ghp_..."   # GitHub Models (default)
```

See [AI Providers](../configuration/ai-providers.md) if you want to use OpenAI, Groq, Ollama, or another backend instead.

## 3. Start the app

```bash
npm run dev:full
```

This starts both the Node.js API server (port `8787`) and the Vite dev server (port `5173`) in a single command.

Open **<http://localhost:5173>** in your browser.

!!! tip "Run servers separately"
    If you prefer separate terminals:

    ```bash
    # Terminal 1 — API server
    npm run dev:server

    # Terminal 2 — Frontend
    npm run dev
    ```

## 4. Download the card database

On first launch the app will display a banner asking you to download the Pokémon TCG database. Click **Download** and wait for it to complete (typically a 10–20 MB ZIP file). This only needs to be done once per data directory.

## 5. Scan your first card

1. Click **Scan Card** (camera icon).
2. Allow camera access when prompted (or click **Upload Image** to use a file instead).
3. Point your camera at a Pokémon card and capture the image.
4. The AI will identify the card — confirm or adjust the result.
5. The card is added to your collection. 🎉

## Next Steps

- [Installation](installation.md) — full setup options including Docker
- [AI Providers](../configuration/ai-providers.md) — switch to a different AI backend
- [Environment Variables](../configuration/environment.md) — full reference for all env vars

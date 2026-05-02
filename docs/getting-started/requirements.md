# Requirements

## Software

| Requirement | Minimum | Recommended |
|---|---|---|
| Node.js | 20.19.0 | 22.x LTS |
| npm | 10 | latest |
| Git | any | latest |

!!! note "Node.js version manager"
    The repository ships an `.nvmrc` file. If you use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm), simply run `nvm use` / `fnm use` in the project directory to switch to the correct Node.js version automatically.

## AI Provider Access

The card scanning feature requires access to a **vision-capable language model**. Choose one:

| Provider | Requirement |
|---|---|
| GitHub Models (default) | Free GitHub Personal Access Token (no extra scopes) |
| OpenAI | `OPENAI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Ollama | Ollama running locally with a vision-capable model (e.g. `llava`) |
| Azure OpenAI | `AZURE_OPENAI_URL` + `AZURE_OPENAI_API_KEY` |
| Anthropic Claude | `ANTHROPIC_API_KEY` |

See [AI Providers](../configuration/ai-providers.md) for configuration details.

## Hardware

| Component | Minimum |
|---|---|
| RAM | 512 MB |
| Storage | 500 MB (for the Pokémon TCG database, ~200–300 MB) |
| Camera | Required for live scanning; file upload works without one |
| Internet | Required on first launch to download the card database; optional afterwards |

## Browser

Any modern browser with camera API support:

- Chrome / Chromium 90+
- Firefox 90+
- Safari 15+
- Edge 90+

!!! info "Camera permissions"
    The browser will request camera permission when you first use the scan feature. You can always use the **Upload Image** option instead if camera access is unavailable.

## Docker (optional)

If running via Docker:

| Requirement | Version |
|---|---|
| Docker Engine | 20.10+ |
| Docker Compose | v2 (optional) |

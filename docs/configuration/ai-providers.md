# AI Providers

PokéDex Scanner supports multiple AI providers for card image recognition. All providers use a **vision-capable language model** — the server handles any request/response translation transparently.

## Supported providers

| Provider | `AI_PROVIDER` value | Required env var | Notes |
|---|---|---|---|
| **GitHub Models** (default) | `github` | `GITHUB_MODELS_TOKEN` | Free GitHub PAT, no extra scopes |
| **OpenAI** | `openai` | `OPENAI_API_KEY` | |
| **Groq** | `groq` | `GROQ_API_KEY` | Free tier available |
| **Ollama** | `ollama` | *(none)* | Runs locally, no API key needed |
| **Azure OpenAI** | `azure` | `AZURE_OPENAI_URL`, `AZURE_OPENAI_API_KEY` | |
| **Anthropic Claude** | `anthropic` | `ANTHROPIC_API_KEY` | Request/response format translated server-side |

## Default models per provider

| Provider | Default model |
|---|---|
| GitHub Models | `meta/llama-4-maverick-17b-128e-instruct-fp8` |
| OpenAI | `gpt-4o` |
| Groq | `meta-llama/llama-4-scout-17b-16e-instruct` |
| Ollama | `llava` |
| Anthropic | `claude-opus-4-5` |

Override with `VITE_CARD_ANALYSIS_MODEL=<model-name>`.

## Configuration examples

=== "GitHub Models (default)"

    ```bash
    export AI_PROVIDER=github
    export GITHUB_MODELS_TOKEN="ghp_..."
    npm run dev:server
    ```

    Get a free token at <https://github.com/settings/tokens/new?description=Pokemon+Card+Scanner&scopes=>.

=== "OpenAI"

    ```bash
    export AI_PROVIDER=openai
    export OPENAI_API_KEY="sk-..."
    export VITE_CARD_ANALYSIS_MODEL=gpt-4o
    npm run dev:server
    ```

=== "Groq"

    ```bash
    export AI_PROVIDER=groq
    export GROQ_API_KEY="gsk_..."
    export VITE_CARD_ANALYSIS_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
    npm run dev:server
    ```

=== "Ollama (local)"

    ```bash
    # Start Ollama with a vision model first
    ollama pull llava

    export AI_PROVIDER=ollama
    export OLLAMA_BASE_URL=http://localhost:11434
    export VITE_CARD_ANALYSIS_MODEL=llava
    npm run dev:server
    ```

=== "Azure OpenAI"

    ```bash
    export AI_PROVIDER=azure
    export AZURE_OPENAI_URL="https://<resource>.openai.azure.com/openai/deployments/<deployment>"
    export AZURE_OPENAI_API_KEY="..."
    npm run dev:server
    ```

=== "Anthropic Claude"

    ```bash
    export AI_PROVIDER=anthropic
    export ANTHROPIC_API_KEY="sk-ant-..."
    export VITE_CARD_ANALYSIS_MODEL=claude-opus-4-5
    npm run dev:server
    ```

!!! tip "Choose a vision-capable model"
    Not all models support image input. Make sure the model you select is listed as vision-capable by the provider. The defaults above are all vision-capable.

# Development

This page covers everything you need to contribute to PokéDex Scanner.

## Prerequisites

- Node.js ^20.19.0 or ≥22.12.0 (see `.nvmrc` — 22.x recommended)
- npm ≥10
- An AI provider token (see [AI Providers](../configuration/ai-providers.md))

## Setup

```bash
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner
npm install
cp .env.example .env
# Edit .env and set GITHUB_MODELS_TOKEN (or another provider key)
```

## Running locally

```bash
# Start everything in one terminal
npm run dev:full

# Or start servers separately:
npm run dev:server   # API server on :8787
npm run dev          # Vite frontend on :5173
```

## Project structure

```
pokemon-card-scanner/
├── server/                  # Node.js API server
│   ├── index.mjs            # Entry point; HTTP/HTTPS server, routes
│   ├── db.mjs               # SQLite database helpers
│   ├── download.mjs         # Pokémon TCG database download logic
│   ├── ai-transformers.mjs  # AI provider request/response adapters
│   ├── logger.mjs           # Structured logger
│   └── utils.mjs            # Shared utilities
├── src/                     # React frontend (Vite + TypeScript)
│   ├── components/          # UI components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # API client, TCG database helpers
│   └── App.tsx              # Root component
├── tests/                   # Unit tests (Vitest)
├── docs/                    # This documentation (MkDocs)
├── Dockerfile               # Multi-stage Docker build
├── mkdocs.yml               # MkDocs configuration
└── vite.config.ts           # Vite + Vitest configuration
```

## Testing

```bash
# Run unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests use [Vitest](https://vitest.dev/) with the `node` environment. Coverage is provided by the v8 provider.

## Linting

```bash
npm run lint
```

ESLint is configured in `eslint.config.js`.

## Building for production

```bash
npm run build
```

Output is written to `dist/`. The Node.js server in `server/index.mjs` serves these static files alongside the API.

## Working on the documentation

The documentation site is built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/).

### Install doc dependencies

```bash
pip install -r requirements.txt
```

### Preview locally

```bash
mkdocs serve
```

Open <http://127.0.0.1:8000>.

### Build the docs site

```bash
mkdocs build
```

Output is written to `site/`.

### Deploying

Documentation is deployed automatically to the `gh-pages` branch via the [`deploy-docs.yml`](https://github.com/pacorreia/pokemon-card-scanner/blob/main/.github/workflows/deploy-docs.yml) workflow when changes are pushed to `main`.

## CI/CD

| Workflow | Trigger | Description |
|---|---|---|
| `ci.yml` | Push / PR to `main` | Lint, test, build, push Docker image |
| `deploy-docs.yml` | Push to `main` (docs changes) | Build and deploy MkDocs site to `gh-pages` |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and add tests where applicable
4. Run `npm run lint && npm run test && npm run build` to verify
5. Push and open a pull request against `main`

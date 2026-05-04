# Pokemon Card Scanner — Agent Instructions

Personal Pokémon TCG card scanner. Camera → LLM identifies card → saves to SQLite collection.
Single-user, self-hosted, Docker deployed.

## Architecture

**Stack:** React + TypeScript (Vite 7), Node.js 22 ESM (`--experimental-sqlite`), SQLite, Tailwind + Shadcn/Radix UI, TanStack Virtual.

**Key paths:**
- `src/App.tsx` — view routing, all dialog state, hook wiring
- `src/components/` — all UI components (CardDetailsSheet, Scanner, etc.)
- `src/hooks/` — `useAuth`, `useCardCollection`, `useCatalogFilters`, `useCatalogVirtualizer`
- `src/lib/` — `card-analysis`, `collection-api`, `tcg-database`, `api-fetch`, `types`, `image-processing`
- `server/index.mjs` — HTTP/HTTPS server, all endpoints, AI proxy, auth
- `server/db.mjs` — SQLite schema and all DB operations
- `server/download.mjs` — downloads `PokemonTCG/pokemon-tcg-data` from GitHub releases
- `data/pokedex.db` — SQLite DB (owned by root when Docker writes it)

## Build and Test

> **Docker context:** The `homenas` context points to a remote NAS at `ssh://192.168.2.9` where the production container (`pokedex-scanner`) runs. Always ensure the `default` context is active before local development.

```bash
docker context use default      # must be default, not homenas

nvm use                         # Node 22.13.0 required
npm run build                   # tsc + vite → dist/

# Rebuild and restart local container
docker rm -f pokemon-card-scanner-local 2>/dev/null
docker build -t pokemon-card-scanner:latest . -q
docker run -d --name pokemon-card-scanner-local \
  -p 9443:8443 -p 7777:8787 \
  -v "$(pwd)/data:/data" \
  --env-file .env.local \
  pokemon-card-scanner:latest
docker logs -f pokemon-card-scanner-local
```

**Database access from host** (file owned by root after Docker writes):
```bash
docker stop pokemon-card-scanner-local   # release WAL lock first
sudo sqlite3 data/pokedex.db
```

## Conventions

**Server:**
- ESM `.mjs` files, `node:` protocol imports
- No ORM — raw SQL via `--experimental-sqlite`
- All card/set data stored as JSON blobs in `data` columns
- Mutations require `API_SECRET` cookie auth (no secret set = open)

**Client:**
- TypeScript strict, functional components only
- Tailwind classes, no inline styles
- Toast only for user-visible outcomes — never for background/silent operations
- Background `api.updateCard()` calls: always `.catch(() => {})` to silence errors
- Cancel effects with a boolean flag to prevent stale state updates

**Dedup:**
- Identity key: `name::set::cardNumber`; prefer `tcgCardId` match over identity key
- Match → increment `quantity`, never insert duplicate row (both client and server enforce)

**Prices:**
- TCG data from GitHub has no prices — fetched live from `api.pokemontcg.io` on first view
- Cached back to `tcg_cards.data` via `updateTcgCardPrices()`
- `priceFetchFailedAt` map: 1h cooldown before retrying a failed card

**AI providers** (all calls proxied server-side, token never reaches client):
`GITHUB_MODELS_TOKEN` (default) | `OPENAI_API_KEY` | `GROQ_API_KEY` | `ANTHROPIC_API_KEY` | `AZURE_OPENAI_URL`+`AZURE_OPENAI_API_KEY` | `OLLAMA_BASE_URL`

**Auth:**
- `API_SECRET` unset = fully open (local default)
- Set = password login → HMAC-signed `pcs_session` HttpOnly cookie, `SameSite=Strict`, 7-day TTL
- `GET /api/collection` and `GET /api/collections` are intentionally unauthenticated

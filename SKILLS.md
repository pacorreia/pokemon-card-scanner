---
name: pokemon-card-scanner
description: "Pokemon Card Scanner project workflows. Use when: adding features, fixing bugs, running DB operations, managing Docker, working with the AI card analysis pipeline, handling prices, managing card collections, or debugging auth. Covers all development and operational tasks for this project."
---

# Pokemon Card Scanner — Skills & Workflows

## Database Operations

### Access DB from host
```bash
docker stop pokemon-card-scanner-local   # release WAL lock
sudo sqlite3 data/pokedex.db
```

### Useful queries
```sql
-- Find duplicates
SELECT name, json_extract(data,'$.set'), json_extract(data,'$.cardNumber'), COUNT(*) c
FROM collection_cards GROUP BY name, json_extract(data,'$.set'), json_extract(data,'$.cardNumber') HAVING c > 1;

-- Merge duplicate rows (keep lowest id, add quantities)
UPDATE collection_cards SET data = json_set(data,'$.quantity', <total>)
WHERE id = <keep_id>;
DELETE FROM collection_cards WHERE id = <delete_id>;

-- Inspect card prices
SELECT id, json_extract(data,'$.tcgplayer'), json_extract(data,'$.cardmarket')
FROM tcg_cards WHERE id = '<card-id>';
```

## Docker Workflow

> **Docker context:** The `homenas` context points to the production NAS (`ssh://192.168.2.9`). Always switch to `default` before local development.
> Production container is `pokedex-scanner` on the NAS — do not stop/rm it accidentally.

### Full rebuild and redeploy (local)
```bash
docker context use default      # ensure local, not homenas

npm run build
docker rm -f pokemon-card-scanner-local 2>/dev/null
docker build -t pokemon-card-scanner:latest . -q
docker run -d --name pokemon-card-scanner-local \
  -p 9443:8443 -p 7777:8787 \
  -v "$(pwd)/data:/data" \
  --env-file .env.local \
  pokemon-card-scanner:latest
docker logs -f pokemon-card-scanner-local
```

### Quick rebuild (skip `npm run build` if only server changed)
```bash
docker build -t pokemon-card-scanner:latest . -q && \
docker stop pokemon-card-scanner-local && docker rm pokemon-card-scanner-local && \
docker run -d --name pokemon-card-scanner-local \
  -p 9443:8443 -p 7777:8787 -v "$(pwd)/data:/data" --env-file .env.local \
  pokemon-card-scanner:latest
```

## Adding a New API Endpoint

1. Add handler in `server/index.mjs` — follow existing `pathname.match()` pattern
2. Add DB function in `server/db.mjs` if needed
3. Add client call in `src/lib/collection-api.ts`
4. Use `requireAuth(req)` for mutations; read endpoints are open

## Adding a New UI Component

1. Place in `src/components/`
2. Use Tailwind classes — no inline styles
3. Wire state via hooks in `src/hooks/` or locally in the component
4. Toast via `useToast` for user-visible outcomes only

## Price System

| Step | Location | Notes |
|------|----------|-------|
| Detect missing price | `CardDetailsSheet.tsx` | Check `card.prices` on open |
| Fetch live price | `src/lib/tcg-database.ts → getCardById()` | Calls `GET /api/cards/:id` |
| Server fetches from API | `server/index.mjs` | Proxies `api.pokemontcg.io/v2/cards/:id` |
| Cache to DB | `server/db.mjs → updateTcgCardPrices()` | Patches JSON blob |
| Persist to collection card | `CardDetailsSheet.tsx` | `api.updateCard()` fire-and-forget |

## Card Analysis Pipeline

1. Camera captures image → `src/lib/image-processing.ts` (resize/compress)
2. Base64 image → `POST /api/analyze` (server)
3. Server calls LLM with image (provider selected by env var)
4. LLM returns card name, set, number
5. `server/db.mjs → findCardMatch()` looks up `tcg_cards` by identity key
6. Match returned to client → user confirms → `POST /api/collection`
7. Server checks duplicates: `tcgCardId` match first, then `name::set::cardNumber`, then insert

## Auth Flow

```
No API_SECRET set → all endpoints open (local dev default)
API_SECRET set:
  POST /api/login {password} → validates HMAC → sets pcs_session cookie
  All mutation endpoints → requireAuth(req) checks cookie
  Cookie: HttpOnly, SameSite=Strict, Secure (HTTPS), 7-day TTL
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| DB locked / SQLITE_BUSY | Container still running — `docker stop` first |
| Permission denied on data/ | File owned by root — use `sudo sqlite3` |
| Prices not showing | `tcgplayer`/`cardmarket` null in `tcg_cards.data` — will fetch on next view |
| "Failed to update card" toast | Background `api.updateCard` failing — check server logs |
| AI provider 401 | Check env var in `.env.local`, restart container after changes |
| Port 9443 in use | Another container running — check with `docker ps` |

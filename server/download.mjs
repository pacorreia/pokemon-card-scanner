/**
 * server/download.mjs
 *
 * Downloads the full Pokémon TCG card catalogue from the PokemonTCG/pokemon-tcg-data
 * GitHub repository and stores it in the SQLite database via server/db.mjs.
 *
 * Ported from src/lib/tcg-database.ts (client-side) → runs server-side only.
 */

import { insertSets, insertCards, clearTcgData, setTcgMetadata } from './db.mjs'
import { logger } from './logger.mjs'

const GITHUB_API = 'https://api.github.com/repos/PokemonTCG/pokemon-tcg-data'
const GITHUB_RAW = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data'
const CARD_BATCH_SIZE = 15   // concurrent HTTP requests for card files
const DB_INSERT_BATCH  = 500 // rows per SQLite transaction

/**
 * @param {(current: number, total: number, message: string) => void} onProgress
 * @returns {{ cardCount: number, setCount: number }}
 */
export async function runDownload(onProgress) {
  // ── 1. Latest release tag ───────────────────────────────────────────────
  onProgress(5, 100, 'Fetching latest release info...')
  const release = await fetch(`${GITHUB_API}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  }).then(r => { if (!r.ok) throw new Error(`GitHub API ${r.status}`); return r.json() })

  const tag = release.tag_name
  logger.info('download', `Latest release: ${tag}`)

  // ── 2. Sets (single file) ───────────────────────────────────────────────
  onProgress(10, 100, 'Fetching sets...')
  const setsData = await fetch(`${GITHUB_RAW}/${tag}/sets/en.json`)
    .then(r => { if (!r.ok) throw new Error(`sets/en.json ${r.status}`); return r.json() })

  if (!Array.isArray(setsData)) throw new Error('Unexpected sets format')
  const validSets = setsData.filter(s => s && s.id && s.name)
  logger.info('download', `${validSets.length} sets`)

  // ── 3. Card file list (GitHub contents API) ─────────────────────────────
  onProgress(15, 100, `Found ${validSets.length} sets, fetching card file list...`)
  const contents = await fetch(`${GITHUB_API}/contents/cards/en?ref=${tag}`, {
    headers: { Accept: 'application/vnd.github+json' },
  }).then(r => { if (!r.ok) throw new Error(`Card list ${r.status}`); return r.json() })

  const cardFiles = contents
    .filter(f => f.type === 'file' && f.name.endsWith('.json'))
    .map(f => f.name)

  logger.info('download', `${cardFiles.length} card files`)

  if (cardFiles.length === 0) throw new Error('No card files found – repository structure may have changed.')

  // ── 4. Download cards in parallel batches ───────────────────────────────
  onProgress(20, 100, `Downloading ${cardFiles.length} card files...`)

  const setMap       = new Map(validSets.map(s => [s.id, s]))
  const allCards     = []
  let processedFiles = 0

  for (let i = 0; i < cardFiles.length; i += CARD_BATCH_SIZE) {
    const batch = cardFiles.slice(i, i + CARD_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(file =>
        fetch(`${GITHUB_RAW}/${tag}/cards/en/${file}`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    )

    for (const cards of results) {
      if (!Array.isArray(cards)) continue
      for (const card of cards) {
        // Inject set data (not embedded in raw card files)
        if (!card.set && card.id) {
          const setId  = card.id.split('-').slice(0, -1).join('-')
          const setObj = setMap.get(setId)
          if (setObj) card.set = setObj
        }
        allCards.push(card)
      }
    }

    processedFiles += batch.length
    const pct = 20 + (processedFiles / cardFiles.length) * 68
    onProgress(pct, 100, `Downloaded ${processedFiles}/${cardFiles.length} files (${allCards.length} cards)...`)
  }

  logger.info('download', `${allCards.length} cards total`)

  // ── 5. Persist to SQLite ────────────────────────────────────────────────
  onProgress(89, 100, 'Clearing old database...')
  clearTcgData()

  onProgress(91, 100, `Saving ${validSets.length} sets...`)
  insertSets(validSets)

  onProgress(93, 100, `Saving ${allCards.length} cards...`)
  for (let i = 0; i < allCards.length; i += DB_INSERT_BATCH) {
    insertCards(allCards.slice(i, i + DB_INSERT_BATCH))
    const pct = 93 + ((i + DB_INSERT_BATCH) / allCards.length) * 6
    onProgress(Math.min(pct, 99), 100,
      `Saved ${Math.min(i + DB_INSERT_BATCH, allCards.length)}/${allCards.length} cards...`)
  }

  setTcgMetadata('lastUpdated', Date.now())

  onProgress(100, 100, 'Complete!')
  return { cardCount: allCards.length, setCount: validSets.length }
}

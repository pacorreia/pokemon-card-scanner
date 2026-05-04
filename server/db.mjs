/**
 * server/db.mjs
 *
 * SQLite database layer using Node 22's built-in node:sqlite module.
 * Run Node with --experimental-sqlite.
 *
 * Database path: DATA_DIR/pokedex.db  (default: <repo-root>/data/pokedex.db)
 * Two concerns live here:
 *   1. TCG reference data  – tcg_sets, tcg_cards, tcg_metadata
 *   2. User collection     – collection_cards, card_collections, collection_memberships
 */

import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from './logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const DB_PATH = path.join(DATA_DIR, 'pokedex.db')

let db

function normalizePokedexNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.trunc(number)
}

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return rows.some(row => row.name === columnName)
}

function ensureCollectionSchemaMigrations() {
  if (!hasColumn('collection_cards', 'pokedex_number')) {
    db.exec('ALTER TABLE collection_cards ADD COLUMN pokedex_number INTEGER')
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_collection_cards_pokedex_number ON collection_cards(pokedex_number)')

  const needsBackfill = db.prepare('SELECT id, data, pokedex_number FROM collection_cards WHERE pokedex_number IS NULL').all()
  if (needsBackfill.length === 0) return

  const updateStmt = db.prepare('UPDATE collection_cards SET pokedex_number = ? WHERE id = ?')
  const selectTcgByIdStmt = db.prepare('SELECT data FROM tcg_cards WHERE id = ?')
  const selectTcgByIdentityStmt = db.prepare(
    `SELECT tcg_cards.data AS data
       FROM tcg_cards
       LEFT JOIN tcg_sets ON tcg_sets.id = tcg_cards.set_id
      WHERE lower(tcg_cards.name) = lower(?)
        AND tcg_cards.number = ?
        AND lower(COALESCE(tcg_sets.name, '')) = lower(?)
      LIMIT 1`
  )

  function resolveDexFromCollectionCard(card) {
    const fromCard = normalizePokedexNumber(card?.pokedexNumber)
    if (fromCard) return fromCard

    const tcgCardId = card?.tcgCardId
    if (tcgCardId) {
      const tcgRow = selectTcgByIdStmt.get(tcgCardId)
      if (tcgRow?.data) {
        try {
          const tcgCard = JSON.parse(tcgRow.data)
          const dex = normalizePokedexNumber(tcgCard?.nationalPokedexNumbers?.[0])
          if (dex) return dex
        } catch {
          // Ignore malformed TCG row JSON and continue fallback path.
        }
      }
    }

    const cardName = card?.name
    const cardNumber = card?.cardNumber
    const setName = card?.set
    if (!cardName || !cardNumber || !setName) return null

    const tcgByIdentityRow = selectTcgByIdentityStmt.get(cardName, cardNumber, setName)
    if (!tcgByIdentityRow?.data) return null

    try {
      const tcgCard = JSON.parse(tcgByIdentityRow.data)
      return normalizePokedexNumber(tcgCard?.nationalPokedexNumbers?.[0])
    } catch {
      return null
    }
  }

  runInTransaction(() => {
    for (const row of needsBackfill) {
      try {
        const card = JSON.parse(row.data)
        const pokedexNumber = resolveDexFromCollectionCard(card)
        updateStmt.run(pokedexNumber, row.id)
      } catch {
        updateStmt.run(null, row.id)
      }
    }
  })
}

function initializeDatabaseConnection() {
  db = new DatabaseSync(DB_PATH)

  // Performance pragmas
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA foreign_keys=ON;
  `)

  // ── Schema ───────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tcg_sets (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      series TEXT,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tcg_cards (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      set_id     TEXT,
      number     TEXT,
      supertype  TEXT,
      data       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tcg_cards_name   ON tcg_cards(name);
    CREATE INDEX IF NOT EXISTS idx_tcg_cards_set_id ON tcg_cards(set_id);
    CREATE INDEX IF NOT EXISTS idx_tcg_cards_number ON tcg_cards(number);

    CREATE TABLE IF NOT EXISTS tcg_metadata (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_cards (
      id         TEXT PRIMARY KEY,
      name       TEXT,
      date_added INTEGER,
      data       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS card_collections (
      id           TEXT PRIMARY KEY,
      name         TEXT,
      date_created INTEGER,
      data         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_memberships (
      collection_id TEXT NOT NULL,
      card_id       TEXT NOT NULL,
      PRIMARY KEY (collection_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS scan_queue (
      id          TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'pending',
      error       TEXT,
      drafts_json TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
  `)

  ensureCollectionSchemaMigrations()
}

initializeDatabaseConnection()

function runInTransaction(work) {
  db.exec('BEGIN')
  try {
    work()
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
}

function safeUnlink(filePath) {
  try { unlinkSync(filePath) } catch {}
}

// ── DB file import/export ──────────────────────────────────────────────────

export function exportDatabaseFile() {
  // Flush WAL pages into the main DB file so backups are complete.
  try { db.exec('PRAGMA wal_checkpoint(FULL);') } catch {}
  return readFileSync(DB_PATH)
}

export function importDatabaseFile(fileBytes) {
  const tempPath = `${DB_PATH}.upload-${Date.now()}.tmp`
  const backupPath = `${DB_PATH}.backup-${Date.now()}`
  const hadExistingDb = existsSync(DB_PATH)
  const payload = Buffer.isBuffer(fileBytes) ? fileBytes : Buffer.from(fileBytes)

  writeFileSync(tempPath, payload)

  // Validate the uploaded file is a readable SQLite database before swapping,
  // and that it contains all the tables this application requires.
  const REQUIRED_TABLES = [
    'tcg_cards', 'tcg_sets', 'collection_cards', 'card_collections', 'collection_memberships',
  ]
  let probe
  try {
    probe = new DatabaseSync(tempPath)
    const existingTables = new Set(
      probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    )
    const missing = REQUIRED_TABLES.filter(t => !existingTables.has(t))
    if (missing.length > 0) {
      throw new Error(`Imported database is missing required tables: ${missing.join(', ')}`)
    }
  } catch (error) {
    safeUnlink(tempPath)
    throw error
  } finally {
    try { probe?.close() } catch {}
  }

  try {
    try { db.close() } catch {}

    if (hadExistingDb) {
      copyFileSync(DB_PATH, backupPath)
    }

    safeUnlink(`${DB_PATH}-wal`)
    safeUnlink(`${DB_PATH}-shm`)
    renameSync(tempPath, DB_PATH)

    initializeDatabaseConnection()
    return {
      backupPath: hadExistingDb ? path.basename(backupPath) : null,
      status: getTcgStatus() ?? { cardCount: 0, setCount: 0, lastUpdated: null },
    }
  } catch (error) {
    safeUnlink(tempPath)
    if (hadExistingDb && existsSync(backupPath)) {
      try {
        copyFileSync(backupPath, DB_PATH)
        initializeDatabaseConnection()
      } catch {}
    }
    throw error
  }
}

// ── TCG metadata ────────────────────────────────────────────────────────────

export function getTcgStatus() {
  const cardCount = db.prepare('SELECT COUNT(*) AS c FROM tcg_cards').get().c
  const setCount  = db.prepare('SELECT COUNT(*) AS c FROM tcg_sets').get().c
  if (!cardCount) return null
  const lastUpdatedRow = db.prepare("SELECT value FROM tcg_metadata WHERE key = 'lastUpdated'").get()
  let sizeBytes = null
  try { sizeBytes = statSync(DB_PATH).size } catch { /* ignore */ }
  return {
    cardCount,
    setCount,
    lastUpdated: lastUpdatedRow ? Number(lastUpdatedRow.value) : null,
    sizeBytes,
  }
}

export function setTcgMetadata(key, value) {
  db.prepare('INSERT OR REPLACE INTO tcg_metadata (key, value) VALUES (?, ?)').run(key, String(value))
}

export function clearTcgData() {
  db.exec('DELETE FROM tcg_cards; DELETE FROM tcg_sets; DELETE FROM tcg_metadata;')
}

// ── TCG bulk insert ─────────────────────────────────────────────────────────

export function insertSets(sets) {
  const stmt = db.prepare('INSERT OR REPLACE INTO tcg_sets (id, name, series, data) VALUES (?, ?, ?, ?)')
  runInTransaction(() => {
    for (const s of sets) stmt.run(s.id, s.name ?? '', s.series ?? null, JSON.stringify(s))
  })
}

export function insertCards(cards) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO tcg_cards (id, name, set_id, number, supertype, data) VALUES (?, ?, ?, ?, ?, ?)'
  )
  runInTransaction(() => {
    for (const c of cards) {
      stmt.run(c.id, c.name ?? '', c.set?.id ?? null, c.number ?? null, c.supertype ?? null, JSON.stringify(c))
    }
  })
}

// ── TCG card lookup (used by /api/cards/find) ─────────────────────────────

function _normalize(v) { return (v ?? '').toLowerCase().trim() }
function _normalizeAscii(v) {
  return _normalize(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function _normalizeSetText(v) {
  return _normalizeAscii(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
function _normalizeNumber(v) {
  const base = (v ?? '').split('/')[0].trim()
  if (!base) return ''
  return /^\d+$/.test(base) ? String(Number(base)) : base.toUpperCase()
}
function _numberEq(a, b) {
  const na = _normalizeNumber(a), nb = _normalizeNumber(b)
  return !!na && !!nb && na === nb
}
function _parseDenominator(v) {
  const parts = (v ?? '').split('/')
  if (parts.length < 2) return null
  const d = parts[1].trim()
  return /^\d+$/.test(d) ? Number(d) : null
}
function _filterByTotal(candidates, rawNumber) {
  const total = _parseDenominator(rawNumber)
  if (!total || candidates.length <= 1) return candidates
  const byTotal = candidates.filter(c => c.set?.total === total || c.set?.printedTotal === total)
  return byTotal.length > 0 ? byTotal : candidates
}
function _setMatches(card, incomingSet) {
  if (!card.set) return false
  const target     = _normalizeSetText(incomingSet)
  if (!target) return false
  const setName    = _normalizeSetText(card.set.name)
  const setId      = _normalize(card.set.id)
  return setName === target || target.includes(setName) || setId === target || target.includes(setId)
}

function _tokenSet(v) {
  return new Set(_normalizeSetText(v).split(' ').filter(Boolean))
}

function _setTokenOverlapScore(cardSetName, incomingSet) {
  const left = _tokenSet(cardSetName)
  const right = _tokenSet(incomingSet)
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const token of left) {
    if (right.has(token)) overlap += 1
  }
  return overlap
}

function _setSpecificityScore(card, incomingSet) {
  const target = _normalizeSetText(incomingSet)
  if (!target) return 0

  const setName = _normalizeSetText(card?.set?.name)
  const series = _normalizeSetText(card?.set?.series)

  // Prefer full "series + set name" exact matches when available.
  const full = [series, setName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  if (full && full === target) return 10
  if (setName && setName === target) return 8
  if (full && target.includes(full)) return 6
  if (setName && target.includes(setName)) return 4

  return _setTokenOverlapScore(card?.set?.name, incomingSet)
}

function _nameSimilarityScore(cardName, incomingName) {
  const left = _normalizeSetText(cardName)
  const right = _normalizeSetText(incomingName)
  if (!left || !right) return 0
  if (left === right) return 4
  if (left.includes(right) || right.includes(left)) return 2
  return 0
}

function _nameMatchesCandidate(cardName, incomingName) {
  if (!incomingName) return true
  return _nameSimilarityScore(cardName, incomingName) > 0
}

export function findCard(name, setName, cardNumber) {
  const lowerName   = _normalize(name)
  const lowerSet    = _normalize(setName)
  const normNumber  = _normalizeNumber(cardNumber)

  // ── Primary: set + number ────────────────────────────────────────────────
  if (lowerSet && normNumber) {
    const rows = db.prepare('SELECT data FROM tcg_cards WHERE number = ?').all(normNumber)
    const candidates = rows.map(r => JSON.parse(r.data)).filter(c => _setMatches(c, lowerSet))

    if (candidates.length === 1) {
      const only = candidates[0]
      const expectedTotal = _parseDenominator(cardNumber)
      const totalMatches = !expectedTotal || only.set?.total === expectedTotal || only.set?.printedTotal === expectedTotal
      const nameMatches = _nameMatchesCandidate(only.name, name)
      if (totalMatches && nameMatches) return only
      logger.warn('db', 'Rejecting set+number single-candidate match due total/name mismatch')
    }

    if (candidates.length > 1) {
      if (setName) {
        const withSetScore = candidates
          .map(card => ({ card, score: _setSpecificityScore(card, setName) }))
          .sort((a, b) => b.score - a.score)

        if (withSetScore[0]?.score > 0) {
          const topScore = withSetScore[0].score
          const narrowedBySet = withSetScore.filter(item => item.score === topScore).map(item => item.card)
          if (narrowedBySet.length === 1) return narrowedBySet[0]
          if (narrowedBySet.length < candidates.length) {
            candidates.length = 0
            candidates.push(...narrowedBySet)
          }
        }
      }

      if (lowerName) {
        const byName = candidates.filter(c => {
          const n = c.name.toLowerCase()
          return n === lowerName || n.includes(lowerName) || lowerName.includes(n)
        })
        const narrowed = _filterByTotal(byName, cardNumber)
        if (narrowed.length === 1) return narrowed[0]
        if (narrowed.length > 1) { logger.warn('db', 'Ambiguous set+number+name, failing closed'); return null }
      }
      const byTotal = _filterByTotal(candidates, cardNumber)
      if (byTotal.length === 1) return byTotal[0]
      logger.warn('db', 'Ambiguous set+number, failing closed')
      return null
    }
  }

  // ── Secondary: name-based ───────────────────────────────────────────────
  let nameRows = db.prepare('SELECT data FROM tcg_cards WHERE name = ? COLLATE NOCASE').all(name)
  let matches = nameRows.map(r => JSON.parse(r.data))

  if (matches.length === 0) {
    nameRows = db.prepare('SELECT data FROM tcg_cards WHERE name LIKE ? COLLATE NOCASE').all(`%${name}%`)
    matches = nameRows.map(r => JSON.parse(r.data))
  }

  if (setName && matches.length > 1) {
    const setFiltered = matches.filter(c => _setMatches(c, lowerSet))
    if (setFiltered.length > 0) matches = setFiltered
  }

  if (cardNumber && matches.length > 1) {
    const numFiltered = matches.filter(c => _numberEq(c.number, cardNumber))
    if (numFiltered.length > 0) matches = numFiltered
  }

  if (matches.length > 1) {
    const byTotal = _filterByTotal(matches, cardNumber)
    if (byTotal.length !== matches.length) matches = byTotal
  }

  if (matches.length > 1) {
    logger.warn('db', 'Ambiguous name match, failing closed')
    return null
  }

  if (matches.length === 1) return matches[0]

  // ── Final fallback: number-driven match for localized card names ────────
  // Only use this when we have BOTH a set signal AND a name signal to avoid
  // returning a wrong card that merely shares the same number.
  if (normNumber && (setName || name)) {
    const byNumber = db.prepare('SELECT data FROM tcg_cards WHERE number = ?').all(normNumber).map(r => JSON.parse(r.data))
    if (byNumber.length === 0) return null

    let narrowed = _filterByTotal(byNumber, cardNumber)

    // Score and require a positive signal on at least one dimension
    const scored = narrowed.map(card => ({
      card,
      setScore: setName ? _setTokenOverlapScore(card.set?.name, setName) : 0,
      nameScore: name ? _nameSimilarityScore(card.name, name) : 0,
    }))

    // Keep only candidates with at least one non-zero score
    const viable = scored.filter(item => item.setScore > 0 || item.nameScore > 0)
    if (viable.length === 0) return null

    // Sort by combined score
    viable.sort((a, b) => (b.setScore + b.nameScore) - (a.setScore + a.nameScore))
    const topScore = viable[0].setScore + viable[0].nameScore
    const topTier = viable.filter(item => item.setScore + item.nameScore === topScore)
    if (topTier.length === 1) return topTier[0].card
  }

  return null
}

export function getCardById(id) {
  const row = db.prepare('SELECT data FROM tcg_cards WHERE id = ?').get(id)
  return row ? JSON.parse(row.data) : null
}

export function updateTcgCardPrices(id, tcgplayer, cardmarket) {
  const row = db.prepare('SELECT data FROM tcg_cards WHERE id = ?').get(id)
  if (!row) return
  const card = JSON.parse(row.data)
  if (tcgplayer) card.tcgplayer = tcgplayer
  if (cardmarket) card.cardmarket = cardmarket
  db.prepare('UPDATE tcg_cards SET data = ? WHERE id = ?').run(JSON.stringify(card), id)
}

export function findCardsEvolvingFrom(name) {
  return db.prepare(
    `SELECT data FROM tcg_cards WHERE json_extract(data, '$.evolvesFrom') = ? ORDER BY name`
  ).all(name).map(r => JSON.parse(r.data))
}

export function getAllSets() {
  return db.prepare('SELECT data FROM tcg_sets ORDER BY name').all().map(r => JSON.parse(r.data))
}

function _buildCardWhereClause(q, supertype, setId) {
  let sql = ' WHERE 1=1'
  const params = []
  if (q) {
    sql += ' AND (name LIKE ? OR number LIKE ? OR EXISTS (SELECT 1 FROM tcg_sets s WHERE s.id = tcg_cards.set_id AND s.name LIKE ?))'
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (supertype) { sql += ' AND supertype = ?'; params.push(supertype) }
  if (setId)     { sql += ' AND set_id = ?';    params.push(setId) }
  return { sql, params }
}

export function searchCards({ q = '', supertype = '', setId = '', limit = 200, offset = 0 } = {}) {
  const { sql, params } = _buildCardWhereClause(q, supertype, setId)
  return db.prepare(`SELECT data FROM tcg_cards${sql} ORDER BY name LIMIT ? OFFSET ?`)
    .all(...params, limit, offset).map(r => JSON.parse(r.data))
}

export function countCards({ q = '', supertype = '', setId = '' } = {}) {
  const { sql, params } = _buildCardWhereClause(q, supertype, setId)
  return db.prepare(`SELECT COUNT(*) AS c FROM tcg_cards${sql}`).get(...params).c
}

// ── User collection ─────────────────────────────────────────────────────────

export function getCollection() {
  const cards = db.prepare('SELECT data, pokedex_number FROM collection_cards ORDER BY date_added DESC').all().map(r => {
    const card = JSON.parse(r.data)
    if (card.pokedexNumber == null && r.pokedex_number != null) {
      card.pokedexNumber = normalizePokedexNumber(r.pokedex_number) ?? undefined
    }
    return card
  })
  if (cards.length === 0) return cards

  const cardIds = cards.map(card => card.id)
  const placeholders = cardIds.map(() => '?').join(', ')
  const memberships = db.prepare(
    `SELECT card_id, collection_id FROM collection_memberships WHERE card_id IN (${placeholders})`
  ).all(...cardIds)

  const membershipsByCardId = new Map()
  for (const membership of memberships) {
    const collectionIds = membershipsByCardId.get(membership.card_id)
    if (collectionIds) {
      collectionIds.push(membership.collection_id)
    } else {
      membershipsByCardId.set(membership.card_id, [membership.collection_id])
    }
  }

  return cards.map(card => {
    card.collectionIds = membershipsByCardId.get(card.id) ?? []
    return card
  })
}

export function addToCollection(card) {
  const pokedexNumber = normalizePokedexNumber(card?.pokedexNumber)

  // Deduplicate: prefer tcgCardId match, fall back to name+set+cardNumber
  let existing = null
  if (card.tcgCardId) {
    existing = db.prepare(
      "SELECT id, data FROM collection_cards WHERE json_extract(data, '$.tcgCardId') = ?"
    ).get(card.tcgCardId)
  }
  if (!existing && card.name && card.set && card.cardNumber) {
    existing = db.prepare(
      "SELECT id, data FROM collection_cards WHERE json_extract(data,'$.name') = ? AND json_extract(data,'$.set') = ? AND json_extract(data,'$.cardNumber') = ?"
    ).get(card.name, card.set, card.cardNumber)
  }

  if (existing) {
    // Increment quantity on the existing row instead of inserting a duplicate
    const prev = JSON.parse(existing.data)
    const merged = {
      ...prev,
      quantity: (prev.quantity || 1) + (card.quantity || 1),
      imageUrl:      card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : prev.imageUrl,
      largeImageUrl: card.largeImageUrl || prev.largeImageUrl,
      prices:        card.prices || prev.prices,
      tcgCardId:     card.tcgCardId || prev.tcgCardId,
      supertype:     prev.supertype || card.supertype,
      pokedexNumber: pokedexNumber ?? prev.pokedexNumber,
    }
    db.prepare('UPDATE collection_cards SET name = ?, pokedex_number = ?, data = ? WHERE id = ?')
      .run(merged.name ?? '', normalizePokedexNumber(merged.pokedexNumber), JSON.stringify({ ...merged, collectionIds: undefined }), existing.id)
    return { ...merged, id: existing.id }
  }

  const cardId = card.id || crypto.randomUUID()
  db.prepare('INSERT OR REPLACE INTO collection_cards (id, name, date_added, pokedex_number, data) VALUES (?, ?, ?, ?, ?)')
    .run(
      cardId,
      card.name ?? '',
      card.dateAdded ?? Date.now(),
      pokedexNumber,
      JSON.stringify({ ...card, id: cardId, pokedexNumber: pokedexNumber ?? undefined, collectionIds: undefined }),
    )
  return { ...card, id: cardId }
}

export function updateCollectionCard(id, updates) {
  const row = db.prepare('SELECT data FROM collection_cards WHERE id = ?').get(id)
  if (!row) return null
  const existing = JSON.parse(row.data)
  const updated  = { ...existing, ...updates, id }
  const pokedexNumber = normalizePokedexNumber(updated.pokedexNumber)
  db.prepare('UPDATE collection_cards SET name = ?, date_added = ?, pokedex_number = ?, data = ? WHERE id = ?')
    .run(
      updated.name ?? '',
      updated.dateAdded ?? Date.now(),
      pokedexNumber,
      JSON.stringify({ ...updated, pokedexNumber: pokedexNumber ?? undefined, collectionIds: undefined }),
      id,
    )
  updated.pokedexNumber = pokedexNumber ?? undefined
  updated.collectionIds = db.prepare(
    'SELECT collection_id FROM collection_memberships WHERE card_id = ?'
  ).all(id).map(m => m.collection_id)
  return updated
}

export function deleteFromCollection(id) {
  runInTransaction(() => {
    db.prepare('DELETE FROM collection_memberships WHERE card_id = ?').run(id)
    db.prepare('DELETE FROM collection_cards WHERE id = ?').run(id)
  })
  return { ok: true }
}

// ── Card collections (named folders) ──────────────────────────────────────

export function getCardCollections() {
  return db.prepare('SELECT data FROM card_collections ORDER BY date_created DESC').all().map(r => {
    const col = JSON.parse(r.data)
    col.cardIds = db.prepare(
      'SELECT card_id FROM collection_memberships WHERE collection_id = ?'
    ).all(col.id).map(m => m.card_id)
    return col
  })
}

export function createCardCollection(col) {
  db.prepare('INSERT INTO card_collections (id, name, date_created, data) VALUES (?, ?, ?, ?)')
    .run(col.id, col.name ?? '', col.dateCreated ?? Date.now(), JSON.stringify({ ...col, cardIds: undefined }))
  return { ...col, cardIds: [] }
}

export function updateCardCollection(id, updates) {
  const row = db.prepare('SELECT data FROM card_collections WHERE id = ?').get(id)
  if (!row) return null
  const existing = JSON.parse(row.data)
  const updated  = { ...existing, ...updates, id }
  db.prepare('UPDATE card_collections SET name = ?, data = ? WHERE id = ?')
    .run(updated.name ?? '', JSON.stringify({ ...updated, cardIds: undefined }), id)
  updated.cardIds = db.prepare(
    'SELECT card_id FROM collection_memberships WHERE collection_id = ?'
  ).all(id).map(m => m.card_id)
  return updated
}

export function deleteCardCollection(id) {
  runInTransaction(() => {
    db.prepare('DELETE FROM collection_memberships WHERE collection_id = ?').run(id)
    db.prepare('DELETE FROM card_collections WHERE id = ?').run(id)
  })
  return { ok: true }
}

export function setCollectionMembership(collectionId, cardId, add) {
  if (add) {
    db.prepare('INSERT OR IGNORE INTO collection_memberships (collection_id, card_id) VALUES (?, ?)')
      .run(collectionId, cardId)
  } else {
    db.prepare('DELETE FROM collection_memberships WHERE collection_id = ? AND card_id = ?')
      .run(collectionId, cardId)
  }
  return { ok: true }
}

// ── Scan queue ────────────────────────────────────────────────────────────────

export function queueAdd(id) {
  db.prepare('INSERT OR IGNORE INTO scan_queue (id) VALUES (?)').run(id)
}

export function queueGetAll() {
  const rows = db.prepare('SELECT * FROM scan_queue ORDER BY created_at ASC').all()
  return rows.map(r => ({
    id:        r.id,
    status:    r.status,
    error:     r.error ?? undefined,
    drafts:    r.drafts_json ? JSON.parse(r.drafts_json) : undefined,
    createdAt: r.created_at,
  }))
}

export function queueUpdate(id, patch) {
  const fields = []
  const values = []
  if (patch.status !== undefined) { fields.push('status = ?'); values.push(patch.status) }
  if ('error' in patch)           { fields.push('error = ?');  values.push(patch.error ?? null) }
  if ('drafts' in patch)          { fields.push('drafts_json = ?'); values.push(patch.drafts != null ? JSON.stringify(patch.drafts) : null) }
  if (fields.length === 0) return
  values.push(id)
  db.prepare(`UPDATE scan_queue SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function queueDelete(id) {
  db.prepare('DELETE FROM scan_queue WHERE id = ?').run(id)
}

export function queueClear() {
  const rows = db.prepare('SELECT id FROM scan_queue').all()
  db.prepare('DELETE FROM scan_queue').run()
  return rows.map(r => r.id)
}

export function queueDeleteStale(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs
  const rows = db.prepare('SELECT id FROM scan_queue WHERE created_at < ?').all(cutoff)
  if (rows.length > 0) {
    db.prepare('DELETE FROM scan_queue WHERE created_at < ?').run(cutoff)
  }
  return rows.map(r => r.id)
}

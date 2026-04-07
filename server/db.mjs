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
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const DB_PATH = path.join(DATA_DIR, 'pokedex.db')

let db

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
  `)
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

  // Validate the uploaded file is a readable SQLite database before swapping.
  let probe
  try {
    probe = new DatabaseSync(tempPath)
    probe.prepare('SELECT name FROM sqlite_master LIMIT 1').all()
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
  return {
    cardCount,
    setCount,
    lastUpdated: lastUpdatedRow ? Number(lastUpdatedRow.value) : null,
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
function _normalizeSetText(v) {
  return _normalize(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
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

export function findCard(name, setName, cardNumber) {
  const lowerName   = _normalize(name)
  const lowerSet    = _normalize(setName)
  const normNumber  = _normalizeNumber(cardNumber)

  // ── Primary: set + number ────────────────────────────────────────────────
  if (lowerSet && normNumber) {
    const rows = db.prepare('SELECT data FROM tcg_cards WHERE number = ?').all(normNumber)
    const candidates = rows.map(r => JSON.parse(r.data)).filter(c => _setMatches(c, lowerSet))

    if (candidates.length === 1) return candidates[0]

    if (candidates.length > 1) {
      if (lowerName) {
        const byName = candidates.filter(c => {
          const n = c.name.toLowerCase()
          return n === lowerName || n.includes(lowerName) || lowerName.includes(n)
        })
        const narrowed = _filterByTotal(byName, cardNumber)
        if (narrowed.length === 1) return narrowed[0]
        if (narrowed.length > 1) { console.warn('[db] Ambiguous set+number+name, failing closed'); return null }
      }
      const byTotal = _filterByTotal(candidates, cardNumber)
      if (byTotal.length === 1) return byTotal[0]
      console.warn('[db] Ambiguous set+number, failing closed')
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
    console.warn('[db] Ambiguous name match, failing closed')
    return null
  }

  return matches[0] ?? null
}

export function getCardById(id) {
  const row = db.prepare('SELECT data FROM tcg_cards WHERE id = ?').get(id)
  return row ? JSON.parse(row.data) : null
}

export function getAllSets() {
  return db.prepare('SELECT data FROM tcg_sets ORDER BY name').all().map(r => JSON.parse(r.data))
}

export function searchCards({ q = '', supertype = '', setId = '', limit = 200, offset = 0 } = {}) {
  let sql = 'SELECT data FROM tcg_cards WHERE 1=1'
  const params = []
  if (q) { sql += ' AND name LIKE ?'; params.push(`%${q}%`) }
  if (supertype) { sql += ' AND supertype = ?'; params.push(supertype) }
  if (setId) { sql += ' AND set_id = ?'; params.push(setId) }
  sql += ' ORDER BY name LIMIT ? OFFSET ?'
  params.push(limit, offset)
  return db.prepare(sql).all(...params).map(r => JSON.parse(r.data))
}

export function countCards({ q = '', supertype = '', setId = '' } = {}) {
  let sql = 'SELECT COUNT(*) AS c FROM tcg_cards WHERE 1=1'
  const params = []
  if (q) { sql += ' AND name LIKE ?'; params.push(`%${q}%`) }
  if (supertype) { sql += ' AND supertype = ?'; params.push(supertype) }
  if (setId) { sql += ' AND set_id = ?'; params.push(setId) }
  return db.prepare(sql).get(...params).c
}

// ── User collection ─────────────────────────────────────────────────────────

export function getCollection() {
  const cards = db.prepare('SELECT data FROM collection_cards ORDER BY date_added DESC').all().map(r => JSON.parse(r.data))
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
  db.prepare('INSERT OR REPLACE INTO collection_cards (id, name, date_added, data) VALUES (?, ?, ?, ?)')
    .run(card.id, card.name ?? '', card.dateAdded ?? Date.now(), JSON.stringify({ ...card, collectionIds: undefined }))
  return card
}

export function updateCollectionCard(id, updates) {
  const row = db.prepare('SELECT data FROM collection_cards WHERE id = ?').get(id)
  if (!row) return null
  const existing = JSON.parse(row.data)
  const updated  = { ...existing, ...updates, id }
  db.prepare('UPDATE collection_cards SET name = ?, date_added = ?, data = ? WHERE id = ?')
    .run(updated.name ?? '', updated.dateAdded ?? Date.now(), JSON.stringify({ ...updated, collectionIds: undefined }), id)
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

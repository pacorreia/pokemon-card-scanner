/**
 * server/index.mjs
 *
 * Unified production server:
 *   - Serves the Vite-built frontend from ../dist/
 *   - Proxies /api/github-models  → GitHub Models AI API
 *   - Proxies /github-oauth/*     → GitHub device-flow OAuth
 *   - Manages the SQLite TCG database at DATA_DIR/pokedex.db
 *   - Exposes REST API for the user's card collection & named collections
 *
 * Requires Node 22 with --experimental-sqlite.
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as db from './db.mjs'
import { runDownload } from './download.mjs'

const HOST              = process.env.HOST || '0.0.0.0'
const PORT              = Number(process.env.PORT || 8787)
const GITHUB_MODELS_URL = 'https://models.github.ai/inference/chat/completions'
const GITHUB_PROXY_BASE = 'https://github.com'

// CORS: only allow a specific origin when ALLOWED_ORIGIN is configured.
// Leave unset for same-origin (default) deployments.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''

// Auth: if API_SECRET is set, all mutating endpoints and DB export require
// an "Authorization: Bearer <secret>" header.
const API_SECRET = process.env.API_SECRET || ''

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const STATIC_DIR = path.resolve(__dirname, '..', 'dist')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
}

// ── SSE download state ──────────────────────────────────────────────────────

const downloadState = {
  running:    false,
  lastResult: null, // { type: 'done'|'error', ... }
  clients:    new Set(),
  broadcast(type, data) {
    const line = `data: ${JSON.stringify({ type, ...data })}\n\n`
    for (const client of this.clients) {
      try { client.write(line) } catch { this.clients.delete(client) }
    }
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns CORS response headers when the request origin matches ALLOWED_ORIGIN.
 * Returns an empty object (no CORS headers) for same-origin or unrecognised origins.
 */
function getCorsHeaders(req) {
  if (!ALLOWED_ORIGIN) return {}
  const origin = req?.headers?.origin ?? ''
  if (origin !== ALLOWED_ORIGIN) return {}
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, POST, PUT',
    'Vary': 'Origin',
  }
}

function writeJson(res, statusCode, payload, req = null) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(req),
  })
  res.end(JSON.stringify(payload))
}

/**
 * Returns true when the request carries a valid shared-secret credential.
 * Always returns true when API_SECRET is not configured (open/local deployment).
 * Uses a constant-time comparison to prevent timing attacks.
 */
function isAuthorized(req) {
  if (!API_SECRET) return true
  const auth     = req.headers['authorization'] ?? ''
  const expected = `Bearer ${API_SECRET}`
  if (auth.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  } catch {
    return false
  }
}

function readBody(req, maxBytes = Number(process.env.MAX_JSON_BODY_BYTES || 64 * 1024 * 1024)) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', chunk => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readBinaryBody(req, maxBytes = 512 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', chunk => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ── GitHub OAuth proxy ──────────────────────────────────────────────────────

async function proxyGithubOAuth(req, res, pathname) {
  const allowed = new Set([
    '/github-oauth/login/device/code',
    '/github-oauth/login/oauth/access_token',
  ])
  if (!allowed.has(pathname)) { writeJson(res, 404, { error: 'Not found' }, req); return }

  const body     = req.method === 'POST' ? await readBody(req) : undefined
  const upstream = await fetch(`${GITHUB_PROXY_BASE}${pathname.replace('/github-oauth', '')}`, {
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
      'Accept':       req.headers.accept          || 'application/json',
    },
    body,
  })
  const text = await upstream.text()
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    ...getCorsHeaders(req),
  })
  res.end(text)
}

// ── Static file serving ─────────────────────────────────────────────────────

async function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname
  const target   = path.normalize(path.join(STATIC_DIR, safePath))
  if (!target.startsWith(STATIC_DIR)) { writeJson(res, 403, { error: 'Forbidden' }, req); return }

  try {
    const data = await readFile(target)
    const ext  = path.extname(target)
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(data)
  } catch {
    try {
      const html = await readFile(path.join(STATIC_DIR, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      res.end(html)
    } catch {
      writeJson(res, 500, { error: 'Static assets not found. Did you run npm run build?' }, req)
    }
  }
}

// ── Request router ──────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  if (!req.url) { writeJson(res, 400, { error: 'Invalid URL' }, req); return }

  const url      = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname
  const method   = req.method

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, getCorsHeaders(req))
    res.end()
    return
  }

  try {
    // ── Health ──────────────────────────────────────────────────────────────
    if (pathname === '/api/health' && method === 'GET') {
      writeJson(res, 200, { ok: true }, req)
      return
    }

    // ── GitHub Models proxy ─────────────────────────────────────────────────
    if (pathname === '/api/github-models' && method === 'POST') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const token = process.env.GITHUB_MODELS_TOKEN
      if (!token) {
        writeJson(res, 500, { error: 'GITHUB_MODELS_TOKEN not set on server.' }, req)
        return
      }
      let body
      try { body = await readBody(req); JSON.parse(body) }
      catch { writeJson(res, 400, { error: 'Invalid JSON body' }, req); return }

      const upstream = await fetch(GITHUB_MODELS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body,
      })
      const text = await upstream.text()
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        ...getCorsHeaders(req),
      })
      res.end(text)
      return
    }

    // ── GitHub OAuth proxy ──────────────────────────────────────────────────
    if (pathname.startsWith('/github-oauth/')) {
      await proxyGithubOAuth(req, res, pathname)
      return
    }

    // ── DB status ───────────────────────────────────────────────────────────
    if (pathname === '/api/db/status' && method === 'GET') {
      writeJson(res, 200, db.getTcgStatus(), req)
      return
    }

    // ── DB export (download sqlite file) ───────────────────────────────────
    if (pathname === '/api/db/export' && method === 'GET') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const bytes = db.exportDatabaseFile()
      const datePart = new Date().toISOString().slice(0, 10)
      res.writeHead(200, {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="pokedex-${datePart}.db"`,
        'Content-Length': String(bytes.length),
        ...getCorsHeaders(req),
      })
      res.end(bytes)
      return
    }

    // ── DB import (replace sqlite file) ────────────────────────────────────
    if (pathname === '/api/db/import' && method === 'POST') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      if (downloadState.running) {
        writeJson(res, 409, { error: 'Cannot import while database download is running' }, req)
        return
      }

      const fileBytes = await readBinaryBody(req)
      const result = db.importDatabaseFile(fileBytes)
      writeJson(res, 200, { ok: true, ...result }, req)
      return
    }

    // ── DB download (start) ─────────────────────────────────────────────────
    if (pathname === '/api/db/download' && method === 'POST') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      if (downloadState.running) {
        writeJson(res, 409, { error: 'Download already in progress' }, req)
        return
      }
      downloadState.running    = true
      downloadState.lastResult = null
      writeJson(res, 200, { ok: true }, req)

      runDownload((current, total, message) => {
        downloadState.broadcast('progress', { current, total, message })
      }).then(({ cardCount, setCount }) => {
        downloadState.running    = false
        downloadState.lastResult = { type: 'done', cardCount, setCount }
        downloadState.broadcast('done', { cardCount, setCount })
      }).catch(err => {
        downloadState.running    = false
        downloadState.lastResult = { type: 'error', message: err.message }
        downloadState.broadcast('error', { message: err.message })
      })
      return
    }

    // ── DB progress (SSE) ───────────────────────────────────────────────────
    if (pathname === '/api/db/progress' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        ...getCorsHeaders(req),
      })

      downloadState.clients.add(res)

      // If no active download, immediately replay last result (or idle)
      if (!downloadState.running) {
        const msg = downloadState.lastResult ?? { type: 'idle' }
        res.write(`data: ${JSON.stringify(msg)}\n\n`)
      }

      req.on('close', () => downloadState.clients.delete(res))
      return
    }

    // ── TCG card lookup ─────────────────────────────────────────────────────
    if (pathname === '/api/cards/find' && method === 'GET') {
      const card = db.findCard(
        url.searchParams.get('name')   ?? '',
        url.searchParams.get('set')    ?? '',
        url.searchParams.get('number') ?? '',
      )
      writeJson(res, 200, card, req)
      return
    }

    // ── TCG card search (used by DatabaseBrowser) ───────────────────────────
    if (pathname === '/api/cards' && method === 'GET') {
      const cards = db.searchCards({
        q:         url.searchParams.get('q')         ?? '',
        supertype: url.searchParams.get('supertype') ?? '',
        setId:     url.searchParams.get('setId')     ?? '',
        limit:     Number(url.searchParams.get('limit')  || 200),
        offset:    Number(url.searchParams.get('offset') || 0),
      })
      const total = db.countCards({
        q:         url.searchParams.get('q')         ?? '',
        supertype: url.searchParams.get('supertype') ?? '',
        setId:     url.searchParams.get('setId')     ?? '',
      })
      writeJson(res, 200, { cards, total }, req)
      return
    }

    // ── All sets ────────────────────────────────────────────────────────────
    if (pathname === '/api/sets' && method === 'GET') {
      writeJson(res, 200, db.getAllSets(), req)
      return
    }

    // ── TCG card by ID ──────────────────────────────────────────────────────
    const cardByIdMatch = pathname.match(/^\/api\/cards\/(.+)$/)
    if (cardByIdMatch && method === 'GET') {
      writeJson(res, 200, db.getCardById(decodeURIComponent(cardByIdMatch[1])), req)
      return
    }

    // ── Collection list / add ───────────────────────────────────────────────
    if (pathname === '/api/collection') {
      if (method === 'GET') {
        writeJson(res, 200, db.getCollection(), req)
        return
      }
      if (method === 'POST') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        const card = db.addToCollection(JSON.parse(await readBody(req)))
        writeJson(res, 201, card, req)
        return
      }
    }

    // ── Collection card by ID ───────────────────────────────────────────────
    const collCardMatch = pathname.match(/^\/api\/collection\/(.+)$/)
    if (collCardMatch) {
      const cardId = decodeURIComponent(collCardMatch[1])
      if (method === 'PUT') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        const updated = db.updateCollectionCard(cardId, JSON.parse(await readBody(req)))
        if (!updated) { writeJson(res, 404, { error: 'Card not found' }, req); return }
        writeJson(res, 200, updated, req)
        return
      }
      if (method === 'DELETE') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        writeJson(res, 200, db.deleteFromCollection(cardId), req)
        return
      }
    }

    // ── Named collections list / create ─────────────────────────────────────
    if (pathname === '/api/collections') {
      if (method === 'GET') {
        writeJson(res, 200, db.getCardCollections(), req)
        return
      }
      if (method === 'POST') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        const col = db.createCardCollection(JSON.parse(await readBody(req)))
        writeJson(res, 201, col, req)
        return
      }
    }

    // ── Named collection membership ─────────────────────────────────────────
    const collMemberMatch = pathname.match(/^\/api\/collections\/([^/]+)\/cards$/)
    if (collMemberMatch && method === 'PUT') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const { cardId, add } = JSON.parse(await readBody(req))
      writeJson(res, 200, db.setCollectionMembership(decodeURIComponent(collMemberMatch[1]), cardId, add), req)
      return
    }

    // ── Named collection by ID ──────────────────────────────────────────────
    const collByIdMatch = pathname.match(/^\/api\/collections\/(.+)$/)
    if (collByIdMatch) {
      const collId = decodeURIComponent(collByIdMatch[1])
      if (method === 'PUT') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        const updated = db.updateCardCollection(collId, JSON.parse(await readBody(req)))
        if (!updated) { writeJson(res, 404, { error: 'Collection not found' }, req); return }
        writeJson(res, 200, updated, req)
        return
      }
      if (method === 'DELETE') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        writeJson(res, 200, db.deleteCardCollection(collId), req)
        return
      }
    }

    // ── Static files / SPA fallback ─────────────────────────────────────────
    await serveStatic(req, res, pathname)

  } catch (error) {
    console.error('[server] Unhandled error:', error)
    writeJson(res, 500, { error: error?.message || 'Internal server error' }, req)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[app] Server listening on http://${HOST}:${PORT}`)
  console.log(`[app] Database: ${db.DB_PATH}`)
})

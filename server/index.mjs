/**
 * server/index.mjs
 *
 * Unified production server:
 *   - Serves the Vite-built frontend from ../dist/
 *   - Proxies /api/ai/chat        → AI provider (GitHub Models by default)
 *   - Proxies /api/github-models  → deprecated alias for /api/ai/chat
 *   - Proxies /github-oauth/*     → GitHub device-flow OAuth
 *   - Manages the SQLite TCG database at DATA_DIR/pokedex.db
 *   - Exposes REST API for the user's card collection & named collections
 *
 * Requires Node 22 with --experimental-sqlite.
 */

import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { isIP } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import selfsigned from 'selfsigned'

import * as db from './db.mjs'
import { runDownload } from './download.mjs'
import { logger } from './logger.mjs'
import { transformAnthropicRequest, transformAnthropicResponse } from './ai-transformers.mjs'
import {
  parseCookies,
  getClientAddress,
  isSecureRequest,
  isSameOriginBrowserRequest,
  isRetriableStatus,
  isRetriableNetworkError,
  normalizeClientLogEntry,
} from './utils.mjs'

const PORT              = Number(process.env.PORT || 8787)
const HTTPS_PORT        = Number(process.env.HTTPS_PORT || 8443)
const HTTPS_ENABLED     = process.env.HTTPS_ENABLED !== 'false'
const GITHUB_PROXY_BASE = 'https://github.com'

const AI_PROVIDER = process.env.AI_PROVIDER || 'github' // 'github' | 'openai' | 'groq' | 'ollama' | 'azure' | 'anthropic'

const PROVIDER_CONFIG = {
  github: {
    url: 'https://models.github.ai/inference/chat/completions',
    extraHeaders: (key) => ({ Authorization: `Bearer ${key || process.env.GITHUB_MODELS_TOKEN || ''}` }),
    tokenEnvVar: 'GITHUB_MODELS_TOKEN',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    extraHeaders: (key) => ({ Authorization: `Bearer ${key || process.env.OPENAI_API_KEY || ''}` }),
    tokenEnvVar: 'OPENAI_API_KEY',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    extraHeaders: (key) => ({ Authorization: `Bearer ${key || process.env.GROQ_API_KEY || ''}` }),
    tokenEnvVar: 'GROQ_API_KEY',
  },
  ollama: {
    url: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434') + '/v1/chat/completions',
    extraHeaders: () => ({}),
    tokenEnvVar: null, // no token required
  },
  azure: {
    url: process.env.AZURE_OPENAI_URL || '',
    // Azure OpenAI requires the api-key header, NOT Authorization: Bearer
    extraHeaders: (key) => ({ 'api-key': key || process.env.AZURE_OPENAI_API_KEY || '' }),
    tokenEnvVar: 'AZURE_OPENAI_API_KEY',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    extraHeaders: (key) => ({
      'x-api-key': key || process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    }),
    tokenEnvVar: 'ANTHROPIC_API_KEY',
    transformRequest: transformAnthropicRequest,
    transformResponse: transformAnthropicResponse,
  },
}

// ── Runtime AI settings ─────────────────────────────────────────────────────
// Overrides env-var defaults without requiring a server restart.
// All fields are null to indicate "use the env-var default".
let runtimeAISettings = {
  provider: null,       // string | null — overrides AI_PROVIDER env var
  model: null,          // string | null — overrides the model field in the request body
  apiKeys: {},          // { [providerName]: string } — per-provider key overrides
  ollamaBaseUrl: null,  // string | null — overrides OLLAMA_BASE_URL env var
  azureUrl: null,       // string | null — overrides AZURE_OPENAI_URL env var
}

function getActiveProviderConfig() {
  const providerName = runtimeAISettings.provider ?? AI_PROVIDER
  const cfg = PROVIDER_CONFIG[providerName] ?? PROVIDER_CONFIG.github
  const key = runtimeAISettings.apiKeys[providerName] || null

  // Compute URL, accounting for providers whose base URL is configurable at runtime.
  // Parse with URL() and reconstruct from trusted components to eliminate any SSRF taint.
  let url = cfg.url
  if (providerName === 'ollama') {
    const baseUrl = runtimeAISettings.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    try {
      const parsed = new URL(baseUrl)
      // http is intentionally allowed: Ollama runs locally over plain HTTP by default.
      // Only use http for localhost/private-network Ollama instances; prefer https for remote.
      // https is also accepted for remote deployments behind TLS.
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        url = parsed.origin + parsed.pathname.replace(/\/$/, '') + '/v1/chat/completions'
      }
    } catch { /* keep cfg.url */ }
  } else if (providerName === 'azure') {
    const azureUrl = runtimeAISettings.azureUrl || process.env.AZURE_OPENAI_URL || ''
    if (azureUrl) {
      try {
        const parsed = new URL(azureUrl)
        // Azure OpenAI only supports HTTPS; reject plain-HTTP URLs.
        // Reconstruct from trusted parsed components (origin + path + query) to eliminate SSRF taint.
        // Azure OpenAI endpoints commonly include ?api-version=... which must be preserved.
        if (parsed.protocol === 'https:') {
          url = parsed.origin + parsed.pathname + parsed.search
        }
      } catch { /* keep cfg.url */ }
    }
  }

  return { ...cfg, url, extraHeaders: () => cfg.extraHeaders(key) }
}

const MODELS_FETCH_TIMEOUT_MS = Number(process.env.GITHUB_MODELS_TIMEOUT_MS || 90000)
const MODELS_FETCH_RETRIES = Number(process.env.GITHUB_MODELS_RETRIES || 3)
const MODELS_FETCH_RETRY_BASE_MS = Number(process.env.GITHUB_MODELS_RETRY_BASE_MS || 1000)
const PRICE_FETCH_TIMEOUT_MS = Number(process.env.PRICE_FETCH_TIMEOUT_MS || 5000)
const PRICE_FETCH_RETRY_AFTER_MS = Number(process.env.PRICE_FETCH_RETRY_AFTER_MS || 60 * 60 * 1000) // 1 hour
const CLIENT_LOG_TOKEN_TTL_MS = Number(process.env.CLIENT_LOG_TOKEN_TTL_MS || 2 * 60 * 1000)
const CLIENT_LOG_RATE_LIMIT_WINDOW_MS = Number(process.env.CLIENT_LOG_RATE_LIMIT_WINDOW_MS || 60 * 1000)
const CLIENT_LOG_RATE_LIMIT_MAX = Number(process.env.CLIENT_LOG_RATE_LIMIT_MAX || 300)
const CLIENT_LOG_MAX_BATCH = Number(process.env.CLIENT_LOG_MAX_BATCH || 100)
const CLIENT_LOG_MAX_BODY_BYTES = Number(process.env.CLIENT_LOG_MAX_BODY_BYTES || 128 * 1024)
const CLIENT_LOG_TOKEN_COOKIE = 'client_log_token'
const CLIENT_LOG_TOKEN_SECRET = process.env.CLIENT_LOG_TOKEN_SECRET || process.env.API_SECRET || randomBytes(32).toString('hex')

// CORS: only allow a specific origin when ALLOWED_ORIGIN is configured.
// Leave unset for same-origin (default) deployments.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''

// Auth: if API_SECRET is set, all mutating endpoints and DB export require
// either an "Authorization: Bearer <secret>" header (for backward compat) or
// a valid HTTP-only session cookie obtained via POST /api/auth/login.
const API_SECRET = process.env.API_SECRET || ''

// Session cookie auth (replaces VITE_API_SECRET in the client bundle)
const SESSION_SECRET  = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
const SESSION_TTL_MS  = Number(process.env.SESSION_TTL_MS  || 7 * 24 * 60 * 60 * 1000) // 7 days
const SESSION_COOKIE  = 'pcs_session'

// In-memory negative cache: maps tcgCardId → timestamp of last failed price fetch.
// Prevents hammering the upstream API when a card repeatedly has no price data.
const priceFetchFailedAt = new Map()

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// In containerized environments, bind to 0.0.0.0 to accept connections from external devices
// (Docker port mapping won't work if the service only listens on 127.0.0.1)
const HOST = process.env.HOST || '0.0.0.0'
const STATIC_DIR = path.resolve(__dirname, '..', 'dist')
const TLS_DIR = process.env.TLS_DIR || path.join(path.dirname(db.DB_PATH), 'tls')
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || path.join(TLS_DIR, 'server.key')
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || path.join(TLS_DIR, 'server.crt')
const QUEUE_DIR = process.env.QUEUE_DIR || path.join(path.dirname(db.DB_PATH), 'queue')
const SCAN_QUEUE_TTL_MS = Number(process.env.SCAN_QUEUE_TTL_MS || 24 * 60 * 60 * 1000) // 24 h
await mkdir(QUEUE_DIR, { recursive: true })

async function cleanupScanQueue() {
  try {
    const staleIds = db.queueDeleteStale(SCAN_QUEUE_TTL_MS)
    for (const id of staleIds) {
      await unlink(path.join(QUEUE_DIR, `${id}.jpg`)).catch(() => {})
    }
    const files = await readdir(QUEUE_DIR).catch(() => [])
    const dbIds = new Set(db.queueGetAll().map(i => i.id))
    for (const file of files) {
      if (!file.endsWith('.jpg')) continue
      const id = file.slice(0, -4)
      if (!dbIds.has(id)) await unlink(path.join(QUEUE_DIR, file)).catch(() => {})
    }
    if (staleIds.length > 0) logger.info('queue-cleanup', `Removed ${staleIds.length} stale queue item(s)`)
  } catch (err) {
    logger.warning('queue-cleanup', 'Cleanup error', { error: err?.message })
  }
}


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

const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.pokemontcg.io https://placehold.co; connect-src 'self'; media-src 'self'; frame-ancestors 'self'; form-action 'self'",
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/**
 * Applies security headers to a response using setHeader so they are included
 * regardless of which writeHead / writeJson path eventually sends the response.
 * HSTS is only added for HTTPS requests to avoid persisting it for plain-HTTP or
 * localhost development traffic.
 */
function applySecurityHeaders(res, req) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value)
  }
  if (req && isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}

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

function writeJson(res, statusCode, payload, req = null, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(req),
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

const clientLogRateWindows = new Map()

function isClientLogRateLimited(req) {
  const key = getClientAddress(req)
  const now = Date.now()
  const state = clientLogRateWindows.get(key)

  if (!state || now - state.start >= CLIENT_LOG_RATE_LIMIT_WINDOW_MS) {
    clientLogRateWindows.set(key, { start: now, count: 1 })
    return false
  }

  state.count += 1
  if (state.count <= CLIENT_LOG_RATE_LIMIT_MAX) return false
  return true
}

function signClientLogToken(payload) {
  return createHmac('sha256', CLIENT_LOG_TOKEN_SECRET).update(payload).digest('base64url')
}

function createClientLogToken() {
  const expiresAt = Date.now() + CLIENT_LOG_TOKEN_TTL_MS
  const nonce = randomBytes(16).toString('base64url')
  const payload = `${expiresAt}.${nonce}`
  const signature = signClientLogToken(payload)
  return { token: `${payload}.${signature}`, expiresAt }
}

function verifyClientLogToken(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [expiresAtStr, nonce, signature] = parts
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false

  const payload = `${expiresAt}.${nonce}`
  const expected = signClientLogToken(payload)
  if (expected.length !== signature.length) return false

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

function getClientLogTokenFromRequest(req) {
  const cookies = parseCookies(req)
  return cookies[CLIENT_LOG_TOKEN_COOKIE] || ''
}

function buildClientLogCookie(token, req) {
  const attrs = [
    `${CLIENT_LOG_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/api/logs/client',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(1, Math.floor(CLIENT_LOG_TOKEN_TTL_MS / 1000))}`,
  ]
  if (isSecureRequest(req)) attrs.push('Secure')
  return attrs.join('; ')
}

function writeClientLogToServerConsole(log, req) {
  const ua = String(req.headers['user-agent'] || '').slice(0, 240)
  const remote = String(req.socket?.remoteAddress || '')
  const prefix = `[client ${log.timestamp}] [${log.scope}]`
  const details = { ip: remote, ua }
  if (log.meta) details.meta = log.meta

  if (log.level === 'error') {
    logger.error('client', `${prefix} ${log.message}`, details)
    return
  }
  if (log.level === 'warning') {
    logger.warning('client', `${prefix} ${log.message}`, details)
    return
  }
  if (log.level === 'info') {
    logger.info('client', `${prefix} ${log.message}`, details)
    return
  }
  if (log.level === 'verbose') {
    logger.verbose('client', `${prefix} ${log.message}`, details)
    return
  }
  logger.debug('client', `${prefix} ${log.message}`, details)
}

function logRejectedClientLogAttempt(reason, req) {
  const ua = String(req.headers['user-agent'] || '').slice(0, 240)
  const remote = getClientAddress(req)
  const origin = String(req.headers.origin || '')
  const secFetchSite = String(req.headers['sec-fetch-site'] || '')
  logger.warning('client-auth', `Rejected client log request: ${reason}`, {
    ip: remote,
    ua,
    origin,
    secFetchSite,
  })
}

// ── Session helpers ──────────────────────────────────────────────────────────

function createSessionToken() {
  const id = randomBytes(16).toString('hex')
  const ts = Date.now().toString()
  const payload = `${id}.${ts}`
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function isValidSessionToken(token) {
  if (typeof token !== 'string' || !token) return false
  const lastDot = token.lastIndexOf('.')
  if (lastDot < 0) return false
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  const expectedSig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  if (sig.length !== expectedSig.length) return false
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false
  } catch { return false }
  const tsDot = payload.indexOf('.')
  if (tsDot < 0) return false
  const ts = Number(payload.slice(tsDot + 1))
  return Number.isFinite(ts) && Date.now() - ts <= SESSION_TTL_MS
}

/**
 * Returns true when the request carries a valid shared-secret credential.
 * Always returns true when API_SECRET is not configured (open/local deployment).
 * Accepts either:
 *   1. An HTTP-only session cookie set via POST /api/auth/login (preferred)
 *   2. A legacy "Authorization: Bearer <secret>" header (backward compat)
 */
function isAuthorized(req) {
  if (!API_SECRET) return true
  const cookies = parseCookies(req)
  if (isValidSessionToken(cookies[SESSION_COOKIE])) return true
  const auth = req.headers['authorization'] ?? ''
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchAIWithRetry(body) {
  const providerConfig = getActiveProviderConfig()
  const { url, extraHeaders, transformRequest, transformResponse } = providerConfig
  let lastError = null

  // Apply runtime model override (or strip the client-supplied model for non-github providers).
  // The client always sends VITE_CARD_ANALYSIS_MODEL which is a GitHub Models default.  When the
  // active provider is not 'github' and the admin hasn't set a model override, forward no model so
  // the provider can apply its own default instead of receiving a GitHub-specific model name.
  let effectiveBody = body
  const activeProvider = runtimeAISettings.provider ?? AI_PROVIDER
  if (runtimeAISettings.model || activeProvider !== 'github') {
    try {
      const parsed = JSON.parse(body)
      if (runtimeAISettings.model) {
        parsed.model = runtimeAISettings.model
      } else {
        // Non-github provider with no override: remove the client-supplied model so the
        // provider uses its own default rather than rejecting a GitHub-specific model name.
        delete parsed.model
      }
      effectiveBody = JSON.stringify(parsed)
    } catch (err) {
      logger.warn('server', 'fetchAIWithRetry: could not apply model override (body is not valid JSON)', err?.message)
    }
  }

  // Apply provider-specific request transformation (e.g. Anthropic format)
  const requestBody = transformRequest ? JSON.stringify(transformRequest(JSON.parse(effectiveBody))) : effectiveBody

  for (let attempt = 0; attempt <= MODELS_FETCH_RETRIES; attempt += 1) {
    try {
      // The `url` here is user-configurable for Ollama/Azure providers.
      // Both paths parse the supplied value with new URL() and reconstruct the target URL
      // from trusted components (origin + pathname + search), enforcing http/https protocol
      // only (Ollama) or https-only (Azure). The settings endpoint itself is admin-gated
      // (POST /api/settings/ai requires isAuthorized()), so the effective attack surface is
      // limited to an authenticated administrator deliberately pointing to a different host.
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders() },
        body: requestBody,
        signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
      }) // codeql[js/request-forgery]

      if (!upstream.ok && isRetriableStatus(upstream.status) && attempt < MODELS_FETCH_RETRIES) {
        const backoffMs = MODELS_FETCH_RETRY_BASE_MS * (2 ** attempt)
        await delay(backoffMs)
        continue
      }

      // Apply provider-specific response transformation (e.g. Anthropic → OpenAI shape)
      if (transformResponse) {
        const rawText = await upstream.text()
        const transformedText = transformResponse(rawText)
        return {
          status: upstream.status,
          ok: upstream.ok,
          text: () => Promise.resolve(transformedText),
          headers: { get: () => 'application/json; charset=utf-8' },
        }
      }

      return upstream
    } catch (error) {
      lastError = error
      if (!isRetriableNetworkError(error) || attempt >= MODELS_FETCH_RETRIES) {
        throw error
      }
      const backoffMs = MODELS_FETCH_RETRY_BASE_MS * (2 ** attempt)
      await delay(backoffMs)
    }
  }

  throw lastError || new Error('Upstream request failed')
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

function collectTlsAltIps() {
  const altIps = new Set(['127.0.0.1', '0.0.0.0', '::1'])

  // Add explicit host when set to an IP address.
  if (HOST && isIP(HOST)) altIps.add(HOST)

  // Add active non-internal interface addresses (helps LAN/mobile HTTPS).
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.internal) continue
      if (!entry.address || !isIP(entry.address)) continue
      altIps.add(entry.address)
    }
  }

  // Optional manual additions: TLS_ALT_IPS=192.168.2.77,10.0.0.5
  const configured = String(process.env.TLS_ALT_IPS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
  for (const ip of configured) {
    if (isIP(ip)) altIps.add(ip)
  }

  return Array.from(altIps)
}

async function loadOrCreateTlsCredentials() {
  try {
    const [key, cert] = await Promise.all([
      readFile(TLS_KEY_PATH, 'utf8'),
      readFile(TLS_CERT_PATH, 'utf8'),
    ])
    return { key, cert, created: false }
  } catch {
    await mkdir(TLS_DIR, { recursive: true })

    const altIps = collectTlsAltIps()

    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: 'localhost' }],
      {
        algorithm: 'sha256',
        days: 3650,
        keySize: 2048,
        extensions: [
          { name: 'basicConstraints', cA: false },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
          { name: 'extKeyUsage', serverAuth: true },
          {
            name: 'subjectAltName',
            altNames: [
              { type: 2, value: 'localhost' },
              ...altIps.map(ip => ({ type: 7, ip })),
            ],
          },
        ],
      },
    )

    await Promise.all([
      writeFile(TLS_KEY_PATH, pems.private, 'utf8'),
      writeFile(TLS_CERT_PATH, pems.cert, 'utf8'),
    ])

    logger.info('tls', `Generated self-signed cert with SAN IPs: ${altIps.join(', ')}`)

    return { key: pems.private, cert: pems.cert, created: true }
  }
}

/**
 * Reads and JSON-parses the request body.
 * Throws an error with `status = 400` on parse failure so the outer handler
 * can return a meaningful 400 instead of a generic 500.
 */
async function readJsonBody(req, maxBytes = Number(process.env.MAX_JSON_BODY_BYTES || 64 * 1024 * 1024)) {
  const text = await readBody(req, maxBytes)
  try {
    return JSON.parse(text)
  } catch {
    const err = new Error('Invalid JSON body')
    err.status = 400
    throw err
  }
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
  const safePath = pathname === '/'
    ? 'index.html'
    : pathname.replace(/^\/+/, '')
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
    // Only fall back to the SPA shell for navigation requests: extensionless
    // paths or requests that explicitly accept HTML. Return 404 for missing
    // static assets (JS/CSS chunks) so misconfigurations surface clearly.
    const ext        = path.extname(pathname)
    const acceptsHtml = (req.headers.accept ?? '').toLowerCase().includes('text/html')
    if (!ext || acceptsHtml) {
      try {
        const html = await readFile(path.join(STATIC_DIR, 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
        res.end(html)
      } catch {
        writeJson(res, 500, { error: 'Static assets not found. Did you run npm run build?' }, req)
      }
    } else {
      writeJson(res, 404, { error: 'Not found' }, req)
    }
  }
}

// ── Request router ──────────────────────────────────────────────────────────

const requestHandler = async (req, res) => {
  applySecurityHeaders(res, req)

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

    // ── Client log token issue (short-lived) ──────────────────────────────
    if (pathname === '/api/logs/client-token' && method === 'POST') {
      if (!isSameOriginBrowserRequest(req)) {
        logRejectedClientLogAttempt('forbidden-origin-token-issue', req)
        writeJson(res, 403, { error: 'Forbidden origin' }, req)
        return
      }

      const { token, expiresAt } = createClientLogToken()
      const cookie = buildClientLogCookie(token, req)
      writeJson(res, 201, { ok: true, expiresAt }, req, { 'Set-Cookie': cookie })
      return
    }

    // ── Client log ingest ───────────────────────────────────────────────────
    if (pathname === '/api/logs/client' && method === 'POST') {
      if (!isSameOriginBrowserRequest(req)) {
        logRejectedClientLogAttempt('forbidden-origin', req)
        writeJson(res, 403, { error: 'Forbidden origin' }, req)
        return
      }

      const token = getClientLogTokenFromRequest(req)
      if (!verifyClientLogToken(token)) {
        logRejectedClientLogAttempt('invalid-or-missing-token', req)
        writeJson(res, 401, { error: 'Unauthorized' }, req)
        return
      }
      if (isClientLogRateLimited(req)) {
        logRejectedClientLogAttempt('rate-limit-exceeded', req)
        writeJson(res, 429, { error: 'Rate limit exceeded' }, req)
        return
      }

      const body = await readJsonBody(req, CLIENT_LOG_MAX_BODY_BYTES)
      const rawLogs = Array.isArray(body?.logs) ? body.logs : [body]
      const parsedLogs = rawLogs
        .map(normalizeClientLogEntry)
        .filter(Boolean)
        .slice(0, CLIENT_LOG_MAX_BATCH)

      if (parsedLogs.length === 0) {
        writeJson(res, 400, { error: 'No valid log entries' }, req)
        return
      }

      for (const logEntry of parsedLogs) {
        writeClientLogToServerConsole(logEntry, req)
      }

      writeJson(res, 202, { accepted: parsedLogs.length }, req)
      return
    }

    // ── Auth endpoints ──────────────────────────────────────────────────────
    if (pathname === '/api/auth/status' && method === 'GET') {
      writeJson(res, 200, {
        required:      Boolean(API_SECRET),
        authenticated: isAuthorized(req),
      }, req)
      return
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      if (!API_SECRET) { writeJson(res, 200, { ok: true }, req); return }
      let body
      try { body = await readJsonBody(req, 4096) } catch { writeJson(res, 400, { error: 'Invalid JSON' }, req); return }
      const password = String(body?.password ?? '')
      let valid = false
      if (password.length === API_SECRET.length) {
        try { valid = timingSafeEqual(Buffer.from(password), Buffer.from(API_SECRET)) } catch { /* timing safe */ }
      }
      if (!valid) { writeJson(res, 401, { error: 'Invalid password' }, req); return }
      const token  = createSessionToken()
      const secure = isSecureRequest(req) ? ' Secure;' : ''
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/`)
      writeJson(res, 200, { ok: true }, req)
      return
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/`)
      writeJson(res, 200, { ok: true }, req)
      return
    }

    // ── AI settings ─────────────────────────────────────────────────────────
    if (pathname === '/api/settings/ai' && method === 'GET') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const providerName = runtimeAISettings.provider ?? AI_PROVIDER
      const cfg = PROVIDER_CONFIG[providerName] ?? PROVIDER_CONFIG.github
      const apiKeySet = Boolean(runtimeAISettings.apiKeys[providerName] || (cfg.tokenEnvVar && process.env[cfg.tokenEnvVar]))
      writeJson(res, 200, {
        provider:      runtimeAISettings.provider ?? AI_PROVIDER,
        model:         runtimeAISettings.model ?? null,
        apiKeySet,
        ollamaBaseUrl: runtimeAISettings.ollamaBaseUrl ?? null,
        azureUrl:      runtimeAISettings.azureUrl ?? null,
      }, req)
      return
    }

    if (pathname === '/api/settings/ai' && method === 'POST') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      let body
      try { body = await readJsonBody(req, 4096) } catch { writeJson(res, 400, { error: 'Invalid JSON' }, req); return }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        writeJson(res, 400, { error: 'Request body must be a JSON object' }, req)
        return
      }

      const allowedProviders = Object.keys(PROVIDER_CONFIG)
      if (body.provider !== undefined) {
        if (body.provider !== null && !allowedProviders.includes(body.provider)) {
          writeJson(res, 400, { error: `Invalid provider. Allowed: ${allowedProviders.join(', ')}` }, req)
          return
        }
        runtimeAISettings.provider = body.provider || null
      }
      if (body.model !== undefined) runtimeAISettings.model = body.model || null
      // apiKey is stored per-provider so switching providers never leaks one provider's key to another.
      // The request may optionally include `provider` in the same call; resolve the target provider name
      // after the provider field has already been applied above.
      if (body.apiKey !== undefined) {
        const targetProvider = runtimeAISettings.provider ?? AI_PROVIDER
        if (body.apiKey) {
          runtimeAISettings.apiKeys[targetProvider] = body.apiKey
        } else {
          delete runtimeAISettings.apiKeys[targetProvider]
        }
      }

      // Validate and store URL overrides — must be http/https to prevent SSRF
      if (body.ollamaBaseUrl !== undefined) {
        const raw = body.ollamaBaseUrl || null
        if (raw !== null) {
          try {
            const parsed = new URL(raw)
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad scheme')
          } catch {
            writeJson(res, 400, { error: 'ollamaBaseUrl must be a valid http/https URL' }, req)
            return
          }
        }
        runtimeAISettings.ollamaBaseUrl = raw
      }
      if (body.azureUrl !== undefined) {
        const raw = body.azureUrl || null
        if (raw !== null) {
          try {
            const parsed = new URL(raw)
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad scheme')
          } catch {
            writeJson(res, 400, { error: 'azureUrl must be a valid http/https URL' }, req)
            return
          }
        }
        runtimeAISettings.azureUrl = raw
      }

      const providerName = runtimeAISettings.provider ?? AI_PROVIDER
      const cfg = PROVIDER_CONFIG[providerName] ?? PROVIDER_CONFIG.github
      const apiKeySet = Boolean(runtimeAISettings.apiKeys[providerName] || (cfg.tokenEnvVar && process.env[cfg.tokenEnvVar]))
      logger.info('server', `AI settings updated: provider=${runtimeAISettings.provider ?? AI_PROVIDER} model=${runtimeAISettings.model ?? '(default)'}`)
      writeJson(res, 200, {
        ok: true,
        provider:      runtimeAISettings.provider ?? AI_PROVIDER,
        model:         runtimeAISettings.model ?? null,
        apiKeySet,
        ollamaBaseUrl: runtimeAISettings.ollamaBaseUrl ?? null,
        azureUrl:      runtimeAISettings.azureUrl ?? null,
      }, req)
      return
    }

    // ── AI chat proxy ───────────────────────────────────────────────────────
    if ((pathname === '/api/ai/chat' || pathname === '/api/github-models') && method === 'POST') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }

      // Token validation: skip for ollama (no auth required)
      const providerCfg = getActiveProviderConfig()
      if (providerCfg.tokenEnvVar !== null) {
        const envToken = process.env[providerCfg.tokenEnvVar]
        const hasToken = Boolean(runtimeAISettings.apiKey || envToken)
        if (!hasToken) {
          writeJson(res, 500, { error: `${providerCfg.tokenEnvVar} not set on server.` }, req)
          return
        }
      }

      let body
      try { body = await readBody(req); JSON.parse(body) }
      catch { writeJson(res, 400, { error: 'Invalid JSON body' }, req); return }

      try {
        const upstream = await fetchAIWithRetry(body)
        const text = await upstream.text()
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          ...getCorsHeaders(req),
        })
        res.end(text)
      } catch (error) {
        logger.error('server', 'AI upstream error:', error)
        writeJson(res, 502, { error: 'Upstream AI service unavailable. Please retry.' }, req)
      }
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

    // ── Scan queue ─────────────────────────────────────────────────────────

    if (pathname === '/api/scan-queue') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }

      if (method === 'GET') {
        writeJson(res, 200, db.queueGetAll(), req)
        return
      }

      if (method === 'POST') {
        const body = await readBody(req, 20 * 1024 * 1024) // 20 MB cap per image upload
        let parsed
        try { parsed = JSON.parse(body) } catch { writeJson(res, 400, { error: 'Invalid JSON' }, req); return }
        const { id, dataUrl } = parsed
        if (!id || typeof id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(id)) {
          writeJson(res, 400, { error: 'Invalid id' }, req); return
        }
        const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(?:jpeg|jpg);base64,(.+)$/)
        if (!match) { writeJson(res, 400, { error: 'Invalid dataUrl: only JPEG data URLs are supported' }, req); return }
        const imageBuffer = Buffer.from(match[1], 'base64')
        const imagePath = path.join(QUEUE_DIR, `${id}.jpg`)
        if (!path.resolve(imagePath).startsWith(path.resolve(QUEUE_DIR))) {
          writeJson(res, 403, { error: 'Forbidden' }, req); return
        }
        await writeFile(imagePath, imageBuffer)
        db.queueAdd(id)
        writeJson(res, 201, { id }, req)
        return
      }

      if (method === 'DELETE') {
        const ids = db.queueClear()
        await Promise.all(ids.map(qid => unlink(path.join(QUEUE_DIR, `${qid}.jpg`)).catch(() => {})))
        writeJson(res, 200, { ok: true }, req)
        return
      }
    }

    const queueImageMatch = pathname.match(/^\/api\/scan-queue\/([^/]+)\/image$/)
    if (queueImageMatch && method === 'GET') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const qid = queueImageMatch[1]
      if (!/^[0-9a-f-]{8,64}$/i.test(qid)) { writeJson(res, 400, { error: 'Invalid id' }, req); return }
      const imagePath = path.join(QUEUE_DIR, `${qid}.jpg`)
      if (!path.resolve(imagePath).startsWith(path.resolve(QUEUE_DIR))) {
        writeJson(res, 403, { error: 'Forbidden' }, req); return
      }
      try {
        const imageBytes = await readFile(imagePath)
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', ...getCorsHeaders(req) })
        res.end(imageBytes)
      } catch {
        writeJson(res, 404, { error: 'Not found' }, req)
      }
      return
    }

    const queueItemMatch = pathname.match(/^\/api\/scan-queue\/([^/]+)$/)
    if (queueItemMatch) {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const qid = queueItemMatch[1]
      if (!/^[0-9a-f-]{8,64}$/i.test(qid)) { writeJson(res, 400, { error: 'Invalid id' }, req); return }

      if (method === 'PATCH') {
        let patch
        try { patch = JSON.parse(await readBody(req)) } catch { writeJson(res, 400, { error: 'Invalid JSON' }, req); return }
        db.queueUpdate(qid, patch)
        writeJson(res, 200, { ok: true }, req)
        return
      }

      if (method === 'DELETE') {
        db.queueDelete(qid)
        await unlink(path.join(QUEUE_DIR, `${qid}.jpg`)).catch(() => {})
        writeJson(res, 200, { ok: true }, req)
        return
      }
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
      const lookupName   = url.searchParams.get('name')   ?? ''
      const lookupSet    = url.searchParams.get('set')    ?? ''
      const lookupNumber = url.searchParams.get('number') ?? ''
      const card = db.findCard(lookupName, lookupSet, lookupNumber)
      logger.info('find', `name="${lookupName}" set="${lookupSet}" number="${lookupNumber}" -> ${card ? card.id : 'null'}`)
      writeJson(res, 200, card, req)
      return
    }

    // ── TCG card search (used by DatabaseBrowser) ───────────────────────────
    if (pathname === '/api/cards' && method === 'GET') {
      const rawLimit = Number(url.searchParams.get('limit'))
      const rawOffset = Number(url.searchParams.get('offset'))
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(0, Math.trunc(rawLimit)), 500)
        : 200
      const offset = Number.isFinite(rawOffset)
        ? Math.max(0, Math.trunc(rawOffset))
        : 0

      const cards = db.searchCards({
        q:         url.searchParams.get('q')         ?? '',
        supertype: url.searchParams.get('supertype') ?? '',
        setId:     url.searchParams.get('setId')     ?? '',
        limit,
        offset,
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
      const tcgId = decodeURIComponent(cardByIdMatch[1])
      let card = db.getCardById(tcgId)
      if (card && !card.tcgplayer && !card.cardmarket) {
        const lastFailed = priceFetchFailedAt.get(tcgId)
        const skipFetch = lastFailed && (Date.now() - lastFailed < PRICE_FETCH_RETRY_AFTER_MS)
        if (!skipFetch) {
          try {
            const liveRes = await fetch(
              `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(tcgId)}`,
              { signal: AbortSignal.timeout(PRICE_FETCH_TIMEOUT_MS) },
            )
            if (liveRes.ok) {
              const { data } = await liveRes.json()
              if (data?.tcgplayer || data?.cardmarket) {
                db.updateTcgCardPrices(tcgId, data.tcgplayer, data.cardmarket)
                card = { ...card, tcgplayer: data.tcgplayer, cardmarket: data.cardmarket }
                priceFetchFailedAt.delete(tcgId)
              } else {
                priceFetchFailedAt.set(tcgId, Date.now())
              }
            } else {
              priceFetchFailedAt.set(tcgId, Date.now())
            }
          } catch {
            // Live price fetch failed — return card without prices
            priceFetchFailedAt.set(tcgId, Date.now())
          }
        }
      }
      writeJson(res, 200, card, req)
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
        const card = db.addToCollection(await readJsonBody(req))
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
        const updated = db.updateCollectionCard(cardId, await readJsonBody(req))
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
        const col = db.createCardCollection(await readJsonBody(req))
        writeJson(res, 201, col, req)
        return
      }
    }

    // ── Named collection membership ─────────────────────────────────────────
    const collMemberMatch = pathname.match(/^\/api\/collections\/([^/]+)\/cards$/)
    if (collMemberMatch && method === 'PUT') {
      if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
      const { cardId, add } = await readJsonBody(req)
      writeJson(res, 200, db.setCollectionMembership(decodeURIComponent(collMemberMatch[1]), cardId, add), req)
      return
    }

    // ── Named collection by ID ──────────────────────────────────────────────
    const collByIdMatch = pathname.match(/^\/api\/collections\/(.+)$/)
    if (collByIdMatch) {
      const collId = decodeURIComponent(collByIdMatch[1])
      if (method === 'PUT') {
        if (!isAuthorized(req)) { writeJson(res, 401, { error: 'Unauthorized' }, req); return }
        const updated = db.updateCardCollection(collId, await readJsonBody(req))
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
    const status = typeof error?.status === 'number' ? error.status : 500
    if (status >= 500) logger.error('server', 'Unhandled error:', error)
    writeJson(res, status, { error: error?.message || 'Internal server error' }, req)
  }
}

const httpServer = createHttpServer(requestHandler)

httpServer.listen(PORT, HOST, () => {
  logger.info('app', `HTTP server listening on http://${HOST}:${PORT}`)
  logger.info('app', `Database: ${db.DB_PATH}`)
  logger.info('server', `AI provider: ${AI_PROVIDER}`)
})

// Run queue cleanup once at startup then every hour
cleanupScanQueue()
setInterval(cleanupScanQueue, 60 * 60 * 1000)

if (HTTPS_ENABLED) {
  try {
    const tlsCredentials = await loadOrCreateTlsCredentials()
    const httpsServer = createHttpsServer({ key: tlsCredentials.key, cert: tlsCredentials.cert }, requestHandler)
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      if (tlsCredentials.created) {
        logger.info('app', `Generated self-signed TLS certificate at ${TLS_CERT_PATH}`)
      }
      logger.info('app', `HTTPS server listening on https://${HOST}:${HTTPS_PORT}`)
    })
  } catch (error) {
    logger.error('app', 'Failed to start HTTPS server:', error)
  }
}

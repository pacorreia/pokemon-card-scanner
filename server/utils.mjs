/**
 * server/utils.mjs
 *
 * Pure, stateless utility functions shared by server/index.mjs.
 * Keeping them in their own module makes them directly importable in tests
 * without triggering the side-effects (DB init, mkdir, server listen) in
 * server/index.mjs.
 */

/**
 * Parses the Cookie request header into a key → value map.
 * Values are URL-decoded; decoding errors fall back to the raw string.
 */
export function parseCookies(req) {
  const header = String(req.headers?.cookie || '')
  if (!header) return {}
  const cookies = {}
  for (const part of header.split(';')) {
    const [rawKey, ...rawValueParts] = part.trim().split('=')
    if (!rawKey) continue
    const rawValue = rawValueParts.join('=')
    try {
      cookies[rawKey] = decodeURIComponent(rawValue || '')
    } catch {
      cookies[rawKey] = rawValue || ''
    }
  }
  return cookies
}

/**
 * Returns the best-guess client IP address.
 * Prefers the leftmost value of X-Forwarded-For (set by trusted reverse proxies).
 */
export function getClientAddress(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  if (forwarded) return forwarded
  return String(req.socket?.remoteAddress || 'unknown')
}

/**
 * Returns true when the request arrived over HTTPS.
 * Checks the X-Forwarded-Proto header first (for reverse-proxy deployments),
 * then falls back to socket.encrypted (for direct TLS connections).
 */
export function isSecureRequest(req) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase()
  if (forwardedProto) return forwardedProto === 'https'
  return Boolean(req.socket?.encrypted)
}

/**
 * Returns true when the request was issued by the browser from the same origin.
 * Validates that Origin matches the Host header and that Sec-Fetch-Site (when
 * present) is "same-origin".  Used to prevent cross-origin client-log abuse.
 */
export function isSameOriginBrowserRequest(req) {
  const origin = String(req.headers?.origin || '').trim()
  const host = String(req.headers?.host || '').trim().toLowerCase()
  const secFetchSite = String(req.headers?.['sec-fetch-site'] || '').trim().toLowerCase()

  if (!origin || !host) return false
  if (secFetchSite && secFetchSite !== 'same-origin') return false

  try {
    const originUrl = new URL(origin)
    if (!['http:', 'https:'].includes(originUrl.protocol)) return false
    return originUrl.host.toLowerCase() === host
  } catch {
    return false
  }
}

/** HTTP status codes worth retrying with exponential back-off. */
export function isRetriableStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

/**
 * Returns true for transient network errors (connection resets, DNS failures,
 * timeouts) that are safe to retry.
 */
export function isRetriableNetworkError(error) {
  if (!error) return false
  const code = error?.cause?.code || error?.code
  if (code && ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true
  const message = String(error?.message || '').toLowerCase()
  return message.includes('fetch failed') || message.includes('timeout')
}

const CLIENT_LOG_LEVELS = new Set(['debug', 'verbose', 'info', 'warning', 'error'])

/**
 * Validates and normalises a single client-log entry received from the browser.
 * Returns null when the entry is invalid and should be silently dropped.
 */
export function normalizeClientLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const level = String(entry.level || '').toLowerCase()
  if (!CLIENT_LOG_LEVELS.has(level)) return null

  const scopeRaw = typeof entry.scope === 'string' ? entry.scope.trim() : ''
  const scope = scopeRaw ? scopeRaw.slice(0, 96) : 'browser'

  const messageRaw = typeof entry.message === 'string' ? entry.message : String(entry.message ?? '')
  const message = messageRaw.trim().slice(0, 4000)
  if (!message) return null

  const timestampRaw = typeof entry.timestamp === 'string' ? entry.timestamp : ''
  const timestamp = timestampRaw && !Number.isNaN(Date.parse(timestampRaw))
    ? timestampRaw
    : new Date().toISOString()

  let meta = null
  if (entry.meta !== undefined) {
    try {
      const serialized = JSON.stringify(entry.meta)
      if (serialized && serialized.length <= 2048) {
        meta = entry.meta
      } else if (serialized) {
        meta = { truncated: `${serialized.slice(0, 2048)}...` }
      }
    } catch {
      meta = { truncated: String(entry.meta).slice(0, 2048) }
    }
  }

  return { level, scope, message, timestamp, meta }
}

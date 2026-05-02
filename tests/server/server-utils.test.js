import { describe, it, expect } from 'vitest'
import {
  parseCookies,
  getClientAddress,
  isSecureRequest,
  isSameOriginBrowserRequest,
  isRetriableStatus,
  isRetriableNetworkError,
  normalizeClientLogEntry,
} from '../../server/utils.mjs'

// ── parseCookies ──────────────────────────────────────────────────────────────

describe('parseCookies', () => {
  it('returns empty object for a request with no cookie header', () => {
    expect(parseCookies({ headers: {} })).toEqual({})
  })

  it('parses a single cookie', () => {
    const req = { headers: { cookie: 'session=abc123' } }
    expect(parseCookies(req)).toEqual({ session: 'abc123' })
  })

  it('parses multiple cookies', () => {
    const req = { headers: { cookie: 'a=1; b=2; c=3' } }
    expect(parseCookies(req)).toEqual({ a: '1', b: '2', c: '3' })
  })

  it('decodes URL-encoded cookie values', () => {
    const req = { headers: { cookie: 'token=hello%20world' } }
    expect(parseCookies(req).token).toBe('hello world')
  })

  it('handles cookie values that contain "=" characters', () => {
    const req = { headers: { cookie: 'pcs_session=a.b.sig===' } }
    expect(parseCookies(req).pcs_session).toBe('a.b.sig===')
  })

  it('skips malformed segments with no key', () => {
    const req = { headers: { cookie: '; valid=yes' } }
    const result = parseCookies(req)
    expect(result.valid).toBe('yes')
    expect(Object.keys(result)).toHaveLength(1)
  })

  it('falls back to raw value when decoding fails', () => {
    // Manually construct an invalid percent-encoded sequence
    const req = { headers: { cookie: 'bad=%GG' } }
    const result = parseCookies(req)
    expect(result.bad).toBe('%GG')
  })

  it('handles undefined headers gracefully', () => {
    expect(parseCookies({ headers: undefined })).toEqual({})
  })
})

// ── getClientAddress ──────────────────────────────────────────────────────────

describe('getClientAddress', () => {
  it('returns the first X-Forwarded-For value', () => {
    const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }
    expect(getClientAddress(req)).toBe('1.2.3.4')
  })

  it('falls back to socket.remoteAddress', () => {
    const req = { headers: {}, socket: { remoteAddress: '10.0.0.1' } }
    expect(getClientAddress(req)).toBe('10.0.0.1')
  })

  it('returns "unknown" when neither header nor socket address is available', () => {
    expect(getClientAddress({ headers: {} })).toBe('unknown')
  })
})

// ── isSecureRequest ───────────────────────────────────────────────────────────

describe('isSecureRequest', () => {
  it('returns true when X-Forwarded-Proto is "https"', () => {
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'https' } })).toBe(true)
  })

  it('returns false when X-Forwarded-Proto is "http"', () => {
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'http' } })).toBe(false)
  })

  it('uses only the first value of a multi-value X-Forwarded-Proto', () => {
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'https, http' } })).toBe(true)
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'http, https' } })).toBe(false)
  })

  it('falls back to socket.encrypted when the header is absent', () => {
    expect(isSecureRequest({ headers: {}, socket: { encrypted: true } })).toBe(true)
    expect(isSecureRequest({ headers: {}, socket: { encrypted: false } })).toBe(false)
  })

  it('returns false when neither header nor encrypted socket is present', () => {
    expect(isSecureRequest({ headers: {} })).toBe(false)
  })

  it('is case-insensitive for the proto value', () => {
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'HTTPS' } })).toBe(true)
  })
})

// ── isSameOriginBrowserRequest ────────────────────────────────────────────────

describe('isSameOriginBrowserRequest', () => {
  it('returns true for a matching same-origin request', () => {
    const req = {
      headers: {
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
    }
    expect(isSameOriginBrowserRequest(req)).toBe(true)
  })

  it('returns false when origin host does not match host header', () => {
    const req = {
      headers: {
        origin: 'http://evil.com',
        host: 'localhost:3000',
      },
    }
    expect(isSameOriginBrowserRequest(req)).toBe(false)
  })

  it('returns false when Sec-Fetch-Site is "cross-site"', () => {
    const req = {
      headers: {
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        'sec-fetch-site': 'cross-site',
      },
    }
    expect(isSameOriginBrowserRequest(req)).toBe(false)
  })

  it('returns false when origin header is missing', () => {
    const req = { headers: { host: 'localhost:3000' } }
    expect(isSameOriginBrowserRequest(req)).toBe(false)
  })

  it('returns false when host header is missing', () => {
    const req = { headers: { origin: 'http://localhost:3000' } }
    expect(isSameOriginBrowserRequest(req)).toBe(false)
  })

  it('returns false for a non-http/https origin', () => {
    const req = {
      headers: {
        origin: 'file://localhost',
        host: 'localhost',
      },
    }
    expect(isSameOriginBrowserRequest(req)).toBe(false)
  })

  it('returns false for a malformed origin URL', () => {
    const req = {
      headers: {
        origin: 'not a url',
        host: 'localhost',
      },
    }
    expect(isSameOriginBrowserRequest(req)).toBe(false)
  })

  it('allows requests without Sec-Fetch-Site (e.g. older browsers)', () => {
    const req = {
      headers: {
        origin: 'https://myapp.example.com',
        host: 'myapp.example.com',
      },
    }
    expect(isSameOriginBrowserRequest(req)).toBe(true)
  })
})

// ── isRetriableStatus ─────────────────────────────────────────────────────────

describe('isRetriableStatus', () => {
  it.each([408, 429, 500, 502, 503, 504])('returns true for status %i', (status) => {
    expect(isRetriableStatus(status)).toBe(true)
  })

  it.each([200, 201, 301, 400, 401, 403, 404, 422])('returns false for status %i', (status) => {
    expect(isRetriableStatus(status)).toBe(false)
  })
})

// ── isRetriableNetworkError ───────────────────────────────────────────────────

describe('isRetriableNetworkError', () => {
  it('returns false for null/undefined', () => {
    expect(isRetriableNetworkError(null)).toBe(false)
    expect(isRetriableNetworkError(undefined)).toBe(false)
  })

  it.each(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'])('returns true for error.code %s', (code) => {
    expect(isRetriableNetworkError({ code })).toBe(true)
  })

  it('reads code from error.cause.code', () => {
    expect(isRetriableNetworkError({ cause: { code: 'ECONNRESET' } })).toBe(true)
  })

  it('returns true when message includes "fetch failed"', () => {
    expect(isRetriableNetworkError({ message: 'fetch failed' })).toBe(true)
    expect(isRetriableNetworkError({ message: 'TypeError: fetch failed' })).toBe(true)
  })

  it('returns true when message includes "timeout"', () => {
    expect(isRetriableNetworkError({ message: 'Request timeout' })).toBe(true)
    expect(isRetriableNetworkError({ message: 'network timeout exceeded' })).toBe(true)
  })

  it('returns false for non-retriable errors', () => {
    expect(isRetriableNetworkError({ message: 'Invalid JSON', code: 'ERR_PARSE' })).toBe(false)
    expect(isRetriableNetworkError(new Error('permission denied'))).toBe(false)
  })
})

// ── normalizeClientLogEntry ───────────────────────────────────────────────────

describe('normalizeClientLogEntry', () => {
  it('returns null for null input', () => {
    expect(normalizeClientLogEntry(null)).toBeNull()
  })

  it('returns null for non-object inputs', () => {
    expect(normalizeClientLogEntry('string')).toBeNull()
    expect(normalizeClientLogEntry(42)).toBeNull()
  })

  it('returns null for an unknown log level', () => {
    expect(normalizeClientLogEntry({ level: 'trace', message: 'hello' })).toBeNull()
    expect(normalizeClientLogEntry({ level: 'critical', message: 'boom' })).toBeNull()
  })

  it('returns null for a missing message', () => {
    expect(normalizeClientLogEntry({ level: 'info' })).toBeNull()
  })

  it('returns null for a whitespace-only message', () => {
    expect(normalizeClientLogEntry({ level: 'info', message: '   ' })).toBeNull()
  })

  it.each(['debug', 'verbose', 'info', 'warning', 'error'])('accepts level "%s"', (level) => {
    const result = normalizeClientLogEntry({ level, message: 'test message' })
    expect(result).not.toBeNull()
    expect(result.level).toBe(level)
  })

  it('normalises level to lowercase', () => {
    const result = normalizeClientLogEntry({ level: 'INFO', message: 'hello' })
    expect(result.level).toBe('info')
  })

  it('falls back to "browser" when scope is absent', () => {
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi' })
    expect(result.scope).toBe('browser')
  })

  it('preserves scope up to 96 characters and truncates beyond', () => {
    const short = normalizeClientLogEntry({ level: 'info', message: 'hi', scope: 'my-scope' })
    expect(short.scope).toBe('my-scope')

    const long = 'a'.repeat(200)
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi', scope: long })
    expect(result.scope.length).toBe(96)
  })

  it('trims and truncates the message at 4000 chars', () => {
    const msg = 'x'.repeat(5000)
    const result = normalizeClientLogEntry({ level: 'info', message: msg })
    expect(result.message.length).toBe(4000)
  })

  it('uses the provided timestamp when it is a valid ISO string', () => {
    const ts = '2024-06-15T12:00:00.000Z'
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi', timestamp: ts })
    expect(result.timestamp).toBe(ts)
  })

  it('generates a fresh timestamp when the provided one is not valid', () => {
    const before = Date.now()
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi', timestamp: 'not-a-date' })
    const after = Date.now()
    const ts = Date.parse(result.timestamp)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('passes through small meta objects unchanged', () => {
    const meta = { foo: 'bar', count: 42 }
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi', meta })
    expect(result.meta).toEqual(meta)
  })

  it('truncates oversized meta with a { truncated } wrapper', () => {
    const bigMeta = { data: 'x'.repeat(3000) }
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi', meta: bigMeta })
    expect(result.meta).toHaveProperty('truncated')
  })

  it('keeps meta as null when not provided', () => {
    const result = normalizeClientLogEntry({ level: 'info', message: 'hi' })
    expect(result.meta).toBeNull()
  })
})

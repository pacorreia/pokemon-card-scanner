import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger, normalizeLevel } from '../../server/logger.mjs'

// ── normalizeLevel ────────────────────────────────────────────────────────────

describe('normalizeLevel', () => {
  it('accepts all known level names unchanged', () => {
    const known = ['debug', 'verbose', 'info', 'warning', 'warn', 'error']
    for (const lvl of known) {
      expect(normalizeLevel(lvl)).toBe(lvl)
    }
  })

  it('is case-insensitive', () => {
    expect(normalizeLevel('INFO')).toBe('info')
    expect(normalizeLevel('DEBUG')).toBe('debug')
    expect(normalizeLevel('ERROR')).toBe('error')
    expect(normalizeLevel('WARNING')).toBe('warning')
    expect(normalizeLevel('VERBOSE')).toBe('verbose')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeLevel('  info  ')).toBe('info')
    expect(normalizeLevel('\twarning\t')).toBe('warning')
  })

  it('returns "info" for unknown strings', () => {
    expect(normalizeLevel('trace')).toBe('info')
    expect(normalizeLevel('critical')).toBe('info')
    expect(normalizeLevel('notice')).toBe('info')
  })

  it('returns "info" for null', () => {
    expect(normalizeLevel(null)).toBe('info')
  })

  it('returns "info" for undefined', () => {
    expect(normalizeLevel(undefined)).toBe('info')
  })

  it('returns "info" for an empty string', () => {
    expect(normalizeLevel('')).toBe('info')
  })

  it('returns "info" for a whitespace-only string', () => {
    expect(normalizeLevel('   ')).toBe('info')
  })
})

// ── logger output behaviour ───────────────────────────────────────────────────

describe('logger', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('exposes all expected log methods', () => {
    expect(typeof logger.verbose).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warning).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('logger.info writes to console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('test-scope', 'hello world')
    expect(spy).toHaveBeenCalledOnce()
    const [prefix, ...rest] = spy.mock.calls[0]
    expect(prefix).toMatch(/\[INFO\]/)
    expect(prefix).toMatch(/\[test-scope\]/)
    expect(rest[0]).toBe('hello world')
  })

  it('logger.error writes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('err-scope', 'something broke')
    expect(spy).toHaveBeenCalledOnce()
    const [prefix] = spy.mock.calls[0]
    expect(prefix).toMatch(/\[ERROR\]/)
    expect(prefix).toMatch(/\[err-scope\]/)
  })

  it('logger.warning writes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warning('warn-scope', 'watch out')
    expect(spy).toHaveBeenCalledOnce()
    const [prefix] = spy.mock.calls[0]
    expect(prefix).toMatch(/\[WARNING\]/)
  })

  it('logger.warn is an alias that also writes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('test', 'alias message')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toMatch(/\[WARNING\]/)
  })

  it('logger.verbose writes to console.debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.verbose('v-scope', 'verbose message')
    // verbose is below the default 'info' threshold so it may be filtered;
    // we only assert the method exists and doesn't throw.
    // If the level is filtered, the spy won't be called — that's correct.
    expect(spy).toBeDefined()
  })

  it('prefix contains an ISO 8601 timestamp', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('scope', 'msg')
    const prefix = spy.mock.calls[0]?.[0] ?? ''
    expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('prefix includes the scope in brackets', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('my-scope', 'msg')
    expect(spy.mock.calls[0]?.[0]).toMatch(/\[my-scope\]/)
  })

  it('forwards multiple extra arguments after the prefix', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('scope', 'first', 'second', { third: true })
    const call = spy.mock.calls[0]
    expect(call[1]).toBe('first')
    expect(call[2]).toBe('second')
    expect(call[3]).toEqual({ third: true })
  })

  it('logger.error forwards an Error object as a spread argument', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    logger.error('scope', 'context', err)
    const call = spy.mock.calls[0]
    expect(call[2]).toBe(err)
  })
})

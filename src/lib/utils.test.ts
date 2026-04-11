import { describe, it, expect } from 'vitest'
import { isUsableImageUrl, pickBestImageUrl } from './utils'

describe('isUsableImageUrl', () => {
  it('returns true for https URLs', () => {
    expect(isUsableImageUrl('https://example.com/card.png')).toBe(true)
  })

  it('returns true for http URLs', () => {
    expect(isUsableImageUrl('http://localhost/card.png')).toBe(true)
  })

  it('returns true for data: image URLs', () => {
    expect(isUsableImageUrl('data:image/png;base64,abc123')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(isUsableImageUrl('')).toBe(false)
  })

  it('returns false for whitespace-only string', () => {
    expect(isUsableImageUrl('   ')).toBe(false)
  })

  it('returns false for the string "undefined"', () => {
    expect(isUsableImageUrl('undefined')).toBe(false)
  })

  it('returns false for the string "null"', () => {
    expect(isUsableImageUrl('null')).toBe(false)
  })

  it('returns false for placehold.co URLs', () => {
    expect(isUsableImageUrl('https://placehold.co/200x300')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isUsableImageUrl(null)).toBe(false)
    expect(isUsableImageUrl(undefined)).toBe(false)
    expect(isUsableImageUrl(42)).toBe(false)
    expect(isUsableImageUrl({})).toBe(false)
  })
})

describe('pickBestImageUrl', () => {
  it('returns the first usable URL', () => {
    expect(pickBestImageUrl('https://example.com/a.png', 'https://example.com/b.png')).toBe('https://example.com/a.png')
  })

  it('skips unusable candidates and returns the first usable one', () => {
    expect(pickBestImageUrl(null, undefined, '', 'https://example.com/card.png')).toBe('https://example.com/card.png')
  })

  it('returns empty string when no usable candidate exists', () => {
    expect(pickBestImageUrl(null, '', 'undefined', 'https://placehold.co/200x300')).toBe('')
  })

  it('returns empty string with no arguments', () => {
    expect(pickBestImageUrl()).toBe('')
  })
})

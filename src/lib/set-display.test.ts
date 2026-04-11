import { describe, it, expect } from 'vitest'
import { getFriendlySetName } from './set-display'

describe('getFriendlySetName', () => {
  it('returns "Unknown Set" when name is undefined', () => {
    expect(getFriendlySetName(undefined)).toBe('Unknown Set')
  })

  it('returns "Unknown Set" when name is empty string', () => {
    expect(getFriendlySetName('')).toBe('Unknown Set')
  })

  it('returns the series for the "151" set when series is provided', () => {
    expect(getFriendlySetName('151', 'Scarlet & Violet')).toBe('Scarlet & Violet')
  })

  it('returns "Scarlet & Violet" for the "151" set when series is absent', () => {
    expect(getFriendlySetName('151')).toBe('Scarlet & Violet')
    expect(getFriendlySetName('151', '')).toBe('Scarlet & Violet')
  })

  it('returns the name as-is for regular sets', () => {
    expect(getFriendlySetName('Base Set')).toBe('Base Set')
    expect(getFriendlySetName('Prismatic Evolutions', 'Scarlet & Violet')).toBe('Prismatic Evolutions')
  })
})

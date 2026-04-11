import { describe, it, expect } from 'vitest'
import {
  isAutoAddEligible,
  confidencePercent,
  getConfidenceBadgeVariant,
  getConfidenceBgClass,
  draftToPokemonCard,
  buildPricesFromTcgCard,
  AUTO_ADD_CONFIDENCE_THRESHOLD,
  type ScannedCardDraft,
} from './card-analysis'

// ── isAutoAddEligible ──────────────────────────────────────────────────────────

describe('isAutoAddEligible', () => {
  it('returns true at exactly the threshold (rounded)', () => {
    expect(isAutoAddEligible(AUTO_ADD_CONFIDENCE_THRESHOLD)).toBe(true)
  })

  it('returns true above the threshold', () => {
    expect(isAutoAddEligible(0.99)).toBe(true)
    expect(isAutoAddEligible(1.0)).toBe(true)
  })

  it('returns false below the threshold', () => {
    expect(isAutoAddEligible(0.0)).toBe(false)
    expect(isAutoAddEligible(0.74)).toBe(false)
    expect(isAutoAddEligible(AUTO_ADD_CONFIDENCE_THRESHOLD - 0.01)).toBe(false)
  })
})

// ── confidencePercent ─────────────────────────────────────────────────────────

describe('confidencePercent', () => {
  it('formats 1.0 as "100%"', () => {
    expect(confidencePercent(1.0)).toBe('100%')
  })

  it('formats 0.0 as "0%"', () => {
    expect(confidencePercent(0.0)).toBe('0%')
  })

  it('rounds to nearest integer', () => {
    expect(confidencePercent(0.856)).toBe('86%')
    expect(confidencePercent(0.854)).toBe('85%')
  })

  it('formats 0.5 as "50%"', () => {
    expect(confidencePercent(0.5)).toBe('50%')
  })
})

// ── getConfidenceBadgeVariant ─────────────────────────────────────────────────

describe('getConfidenceBadgeVariant', () => {
  it('returns "secondary" for high confidence (≥ 0.8)', () => {
    expect(getConfidenceBadgeVariant(0.8)).toBe('secondary')
    expect(getConfidenceBadgeVariant(1.0)).toBe('secondary')
  })

  it('returns "outline" for medium confidence (0.65 – 0.79)', () => {
    expect(getConfidenceBadgeVariant(0.65)).toBe('outline')
    expect(getConfidenceBadgeVariant(0.79)).toBe('outline')
  })

  it('returns "destructive" for low confidence (< 0.65)', () => {
    expect(getConfidenceBadgeVariant(0.0)).toBe('destructive')
    expect(getConfidenceBadgeVariant(0.64)).toBe('destructive')
  })
})

// ── getConfidenceBgClass ──────────────────────────────────────────────────────

describe('getConfidenceBgClass', () => {
  it('returns green class for high confidence (≥ 0.8)', () => {
    expect(getConfidenceBgClass(0.8)).toBe('bg-green-50 border-green-200')
    expect(getConfidenceBgClass(1.0)).toBe('bg-green-50 border-green-200')
  })

  it('returns yellow class for medium confidence (0.65 – 0.79)', () => {
    expect(getConfidenceBgClass(0.65)).toBe('bg-yellow-50 border-yellow-200')
    expect(getConfidenceBgClass(0.75)).toBe('bg-yellow-50 border-yellow-200')
  })

  it('returns red class for low confidence (< 0.65)', () => {
    expect(getConfidenceBgClass(0.0)).toBe('bg-red-50 border-red-200')
    expect(getConfidenceBgClass(0.64)).toBe('bg-red-50 border-red-200')
  })
})

// ── draftToPokemonCard ────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<ScannedCardDraft> = {}): ScannedCardDraft {
  return {
    name: 'Pikachu',
    set: 'Base Set',
    cardNumber: '58',
    rarity: 'Common',
    type: 'Electric',
    supertype: 'Pokémon',
    imageUrl: 'https://example.com/pikachu.png',
    largeImageUrl: 'https://example.com/pikachu-large.png',
    tcgCardId: 'base1-58',
    pokedexNumber: 25,
    prices: undefined,
    recognitionConfidence: 0.95,
    matchConfidence: 0.98,
    confidence: 0.96,
    selected: true,
    ...overrides,
  }
}

describe('draftToPokemonCard', () => {
  it('copies all card fields from the draft', () => {
    const draft = makeDraft()
    const card = draftToPokemonCard(draft)

    expect(card.name).toBe('Pikachu')
    expect(card.set).toBe('Base Set')
    expect(card.cardNumber).toBe('58')
    expect(card.rarity).toBe('Common')
    expect(card.type).toBe('Electric')
    expect(card.supertype).toBe('Pokémon')
    expect(card.imageUrl).toBe('https://example.com/pikachu.png')
    expect(card.tcgCardId).toBe('base1-58')
    expect(card.pokedexNumber).toBe(25)
  })

  it('sets quantity to 1 and dateAdded to a recent timestamp', () => {
    const before = Date.now()
    const card = draftToPokemonCard(makeDraft())
    const after = Date.now()

    expect(card.quantity).toBe(1)
    expect(card.dateAdded).toBeGreaterThanOrEqual(before)
    expect(card.dateAdded).toBeLessThanOrEqual(after)
  })

  it('generates a non-empty unique ID for each call', () => {
    const a = draftToPokemonCard(makeDraft())
    const b = draftToPokemonCard(makeDraft())
    expect(a.id).toBeTruthy()
    expect(b.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
  })
})

// ── buildPricesFromTcgCard ────────────────────────────────────────────────────

describe('buildPricesFromTcgCard', () => {
  it('returns undefined for null/undefined input', () => {
    expect(buildPricesFromTcgCard(null)).toBeUndefined()
    expect(buildPricesFromTcgCard(undefined)).toBeUndefined()
  })

  it('returns undefined when neither tcgplayer nor cardmarket is present', () => {
    expect(buildPricesFromTcgCard({})).toBeUndefined()
    expect(buildPricesFromTcgCard({ name: 'Pikachu' })).toBeUndefined()
  })

  it('extracts tcgplayer normal market price', () => {
    const raw = {
      tcgplayer: {
        url: 'https://tcgplayer.com',
        updatedAt: '2024-01-01',
        prices: { normal: { market: 1.5, low: 0.9, mid: 1.2, high: 2.0 } },
      },
    }
    const result = buildPricesFromTcgCard(raw)
    expect(result?.tcgplayer?.market).toBe(1.5)
    expect(result?.tcgplayer?.low).toBe(0.9)
    expect(result?.tcgplayer?.url).toBe('https://tcgplayer.com')
    expect(result?.cardmarket).toBeUndefined()
  })

  it('extracts cardmarket trend price', () => {
    const raw = {
      cardmarket: {
        url: 'https://cardmarket.com',
        updatedAt: '2024-01-01',
        prices: { trendPrice: 2.5, lowPrice: 1.0, averageSellPrice: 2.0 },
      },
    }
    const result = buildPricesFromTcgCard(raw)
    expect(result?.cardmarket?.trendPrice).toBe(2.5)
    expect(result?.cardmarket?.lowPrice).toBe(1.0)
    expect(result?.tcgplayer).toBeUndefined()
  })

  it('extracts both tcgplayer and cardmarket when present', () => {
    const raw = {
      tcgplayer: { prices: { holofoil: { market: 5.0 } } },
      cardmarket: { prices: { trendPrice: 4.5 } },
    }
    const result = buildPricesFromTcgCard(raw)
    expect(result?.tcgplayer?.holofoil).toBe(5.0)
    expect(result?.cardmarket?.trendPrice).toBe(4.5)
  })

  it('omits price fields that are absent or zero (falsy)', () => {
    const raw = {
      tcgplayer: {
        prices: { normal: { market: 0, low: 1.0 } },
      },
    }
    const result = buildPricesFromTcgCard(raw)
    // market is 0 (falsy) — should not be included
    expect(result?.tcgplayer?.market).toBeUndefined()
    expect(result?.tcgplayer?.low).toBe(1.0)
  })
})

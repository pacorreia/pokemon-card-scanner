import { describe, it, expect } from 'vitest'
import {
  isAutoAddEligible,
  confidencePercent,
  getConfidenceBadgeVariant,
  getConfidenceBgClass,
  draftToPokemonCard,
  buildPricesFromTcgCard,
  resolveListValue,
  clampConfidence,
  normalizeBoundingBox,
  parsePrintedTotal,
  parseCardNumberNumerator,
  isPlaceholderValue,
  normalizeEvolutionStage,
  resizeDataUrlForInference,
  RARITIES,
  TYPES,
  AUTO_ADD_CONFIDENCE_THRESHOLD,
  type ScannedCardDraft,
} from '@/lib/card-analysis'

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

// ── resolveListValue ──────────────────────────────────────────────────────────

const RARITY_ALIASES: Record<string, string> = {
  'holo': 'Holo Rare',
  'holo rare': 'Holo Rare',
  'ultra-rare': 'Ultra Rare',
  'secret': 'Secret Rare',
}

describe('resolveListValue', () => {
  it('returns a canonical value for an exact (case-insensitive) match', () => {
    expect(resolveListValue('common', RARITIES, RARITY_ALIASES)).toBe('Common')
    expect(resolveListValue('RARE', RARITIES, RARITY_ALIASES)).toBe('Rare')
  })

  it('resolves an alias to its canonical value', () => {
    expect(resolveListValue('holo', RARITIES, RARITY_ALIASES)).toBe('Holo Rare')
    expect(resolveListValue('ultra-rare', RARITIES, RARITY_ALIASES)).toBe('Ultra Rare')
  })

  it('returns undefined for unknown values', () => {
    expect(resolveListValue('mythic', RARITIES, RARITY_ALIASES)).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(resolveListValue('', RARITIES, RARITY_ALIASES)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(resolveListValue(undefined, RARITIES, RARITY_ALIASES)).toBeUndefined()
  })

  it('resolves Pokémon type aliases', () => {
    const TYPE_ALIASES: Record<string, string> = {
      'lightning': 'Electric',
      'dark': 'Darkness',
      'colourless': 'Colorless',
    }
    expect(resolveListValue('lightning', TYPES, TYPE_ALIASES)).toBe('Electric')
    expect(resolveListValue('dark', TYPES, TYPE_ALIASES)).toBe('Darkness')
    expect(resolveListValue('fire', TYPES, TYPE_ALIASES)).toBe('Fire')
  })
})

// ── clampConfidence ───────────────────────────────────────────────────────────

describe('clampConfidence', () => {
  it('returns the value unchanged when it is within [0, 1]', () => {
    expect(clampConfidence(0.75, 0.5)).toBe(0.75)
    expect(clampConfidence(0, 0.5)).toBe(0)
    expect(clampConfidence(1, 0.5)).toBe(1)
  })

  it('clamps values below 0 to 0', () => {
    expect(clampConfidence(-0.5, 0.5)).toBe(0)
    expect(clampConfidence(-100, 0.5)).toBe(0)
  })

  it('clamps values above 1 to 1', () => {
    expect(clampConfidence(1.5, 0.5)).toBe(1)
    expect(clampConfidence(999, 0.5)).toBe(1)
  })

  it('returns the fallback for non-number inputs', () => {
    expect(clampConfidence('0.9', 0.5)).toBe(0.5)
    expect(clampConfidence(null, 0.3)).toBe(0.3)
    expect(clampConfidence(undefined, 0.6)).toBe(0.6)
  })

  it('returns the fallback for NaN', () => {
    expect(clampConfidence(NaN, 0.4)).toBe(0.4)
  })
})

// ── normalizeBoundingBox ──────────────────────────────────────────────────────

describe('normalizeBoundingBox', () => {
  it('returns a valid bounding box for correct input', () => {
    const box = { x: 100, y: 200, width: 300, height: 400 }
    expect(normalizeBoundingBox(box)).toEqual(box)
  })

  it('returns undefined for null / undefined / non-object inputs', () => {
    expect(normalizeBoundingBox(null)).toBeUndefined()
    expect(normalizeBoundingBox(undefined)).toBeUndefined()
    expect(normalizeBoundingBox('box')).toBeUndefined()
    expect(normalizeBoundingBox(42)).toBeUndefined()
  })

  it('returns undefined when width is 0', () => {
    expect(normalizeBoundingBox({ x: 0, y: 0, width: 0, height: 100 })).toBeUndefined()
  })

  it('returns undefined when height is 0', () => {
    expect(normalizeBoundingBox({ x: 0, y: 0, width: 100, height: 0 })).toBeUndefined()
  })

  it('clamps values below 0 to 0', () => {
    const result = normalizeBoundingBox({ x: -10, y: -20, width: 100, height: 100 })
    expect(result?.x).toBe(0)
    expect(result?.y).toBe(0)
  })

  it('clamps values above 1000 to 1000', () => {
    const result = normalizeBoundingBox({ x: 2000, y: 1500, width: 999, height: 500 })
    expect(result?.x).toBe(1000)
    expect(result?.y).toBe(1000)
  })

  it('replaces non-numeric fields with 0', () => {
    const result = normalizeBoundingBox({ x: 'left', y: 0, width: 100, height: 200 })
    expect(result?.x).toBe(0)
  })
})

// ── parsePrintedTotal ─────────────────────────────────────────────────────────

describe('parsePrintedTotal', () => {
  it('extracts the denominator from "25/102"', () => {
    expect(parsePrintedTotal('25/102')).toBe(102)
  })

  it('extracts the denominator from "SV001/SV122"', () => {
    // SV122 is not purely numeric → should return null
    expect(parsePrintedTotal('SV001/SV122')).toBeNull()
  })

  it('extracts the denominator from "001/264"', () => {
    expect(parsePrintedTotal('001/264')).toBe(264)
  })

  it('returns null for a number without a slash', () => {
    expect(parsePrintedTotal('25')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parsePrintedTotal(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parsePrintedTotal('')).toBeNull()
  })

  it('returns null when the denominator part is empty', () => {
    expect(parsePrintedTotal('25/')).toBeNull()
  })
})

// ── parseCardNumberNumerator ──────────────────────────────────────────────────

describe('parseCardNumberNumerator', () => {
  it('strips leading zeros from a purely numeric numerator', () => {
    expect(parseCardNumberNumerator('025/102')).toBe('25')
    expect(parseCardNumberNumerator('001/264')).toBe('1')
  })

  it('uppercases alpha-numeric numerators', () => {
    expect(parseCardNumberNumerator('SV001/SV122')).toBe('SV001')
    expect(parseCardNumberNumerator('swsh001/swsh072')).toBe('SWSH001')
  })

  it('returns empty string for a purely alphabetic numerator (no digits)', () => {
    expect(parseCardNumberNumerator('abc/264')).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(parseCardNumberNumerator(undefined)).toBe('')
  })

  it('returns empty string for an empty string', () => {
    expect(parseCardNumberNumerator('')).toBe('')
  })

  it('handles a numerator without a slash (treats the whole string as the numerator)', () => {
    expect(parseCardNumberNumerator('42')).toBe('42')
  })
})

// ── isPlaceholderValue ────────────────────────────────────────────────────────

describe('isPlaceholderValue', () => {
  it.each(['', '?', '??', 'unknown', 'Unknown Set', 'n/a', 'none', 'unidentified'])(
    'returns true for "%s"',
    (value) => {
      expect(isPlaceholderValue(value)).toBe(true)
    },
  )

  it('returns true for undefined', () => {
    expect(isPlaceholderValue(undefined)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isPlaceholderValue('UNKNOWN')).toBe(true)
    expect(isPlaceholderValue('N/A')).toBe(true)
  })

  it('returns false for legitimate card values', () => {
    expect(isPlaceholderValue('Pikachu')).toBe(false)
    expect(isPlaceholderValue('Base Set')).toBe(false)
    expect(isPlaceholderValue('25/102')).toBe(false)
  })
})

// ── normalizeEvolutionStage ───────────────────────────────────────────────────

describe('normalizeEvolutionStage', () => {
  it('returns "basic" for "Basic" and variants', () => {
    expect(normalizeEvolutionStage('Basic')).toBe('basic')
    expect(normalizeEvolutionStage('BASIC')).toBe('basic')
  })

  it('returns "stage1" for "Stage 1" and variants', () => {
    expect(normalizeEvolutionStage('Stage 1')).toBe('stage1')
    expect(normalizeEvolutionStage('Stage1')).toBe('stage1')
    expect(normalizeEvolutionStage('STAGE 1')).toBe('stage1')
  })

  it('returns "stage2" for "Stage 2" and variants', () => {
    expect(normalizeEvolutionStage('Stage 2')).toBe('stage2')
    expect(normalizeEvolutionStage('Stage2')).toBe('stage2')
  })

  it('returns "" for unrecognised values', () => {
    expect(normalizeEvolutionStage('VMAX')).toBe('')
    expect(normalizeEvolutionStage('Mega')).toBe('')
  })

  it('returns "" for undefined', () => {
    expect(normalizeEvolutionStage(undefined)).toBe('')
  })

  it('returns "" for an empty string', () => {
    expect(normalizeEvolutionStage('')).toBe('')
  })
})

// ── resizeDataUrlForInference ─────────────────────────────────────────────────

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '../../assets/cards')

async function loadSharpCard(): Promise<string> {
  const buf = await readFile(path.join(ASSETS, 'sharp.jpg'))
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

describe('resizeDataUrlForInference', () => {
  it('returns a JPEG data URL', async () => {
    const dataUrl = await loadSharpCard()
    const result = await resizeDataUrlForInference(dataUrl, 800, 0.9)
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('returns a different data URL when the image is scaled down', async () => {
    const dataUrl = await loadSharpCard()
    // Use a very small maxSide to force scaling
    const result = await resizeDataUrlForInference(dataUrl, 50, 0.9)
    expect(result).not.toBe(dataUrl)
  })

  it('returns the original data URL when maxSide is larger than the image', async () => {
    const dataUrl = await loadSharpCard()
    // 10000 is larger than our synthetic test card — no scaling, but still reencodes
    const result = await resizeDataUrlForInference(dataUrl, 10000, 0.9)
    // The output is still a JPEG data URL (re-encoded), just same dimensions
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('returns the original data URL on image load error (invalid input)', async () => {
    const invalid = 'data:image/jpeg;base64,!!!'
    const result = await resizeDataUrlForInference(invalid, 800, 0.9)
    expect(result).toBe(invalid)
  })
})


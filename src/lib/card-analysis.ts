/**
 * Core card analysis logic — LLM recognition, database matching, and shared types.
 * Imported by ScanDialog (capture) and ScanQueueDialog (processing).
 */
import { authHeaders } from '@/lib/api-fetch'
import {
  enhanceCardImage,
  extractCardBottomCrop,
  imageDataUrlHash,
  type ImageQualityReport,
} from '@/lib/image-processing'
import { type TCGCard } from '@/lib/tcg-database'
import type { PokemonCard } from '@/lib/types'

const SCAN_PROXY_URL = '/api/github-models'
const CARD_ANALYSIS_MODEL = import.meta.env.VITE_CARD_ANALYSIS_MODEL || 'meta/llama-4-maverick-17b-128e-instruct-fp8'

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Holo Rare', 'Ultra Rare', 'Secret Rare'] as const
export const TYPES = ['Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'] as const

export const BULK_SCAN_JPEG_QUALITY = 0.92
export const LOW_CONFIDENCE_THRESHOLD = 0.74
export const AUTO_ADD_CONFIDENCE_THRESHOLD = 0.95
const SINGLE_FAST_PATH_CONFIDENCE = 0.9
export const SINGLE_SCAN_MAX_IMAGE_SIDE = 1600
export const BULK_SCAN_MAX_IMAGE_SIDE = 2200
export const SINGLE_SCAN_UPLOAD_QUALITY = 0.9
export const BULK_SCAN_UPLOAD_QUALITY = 0.85
const CARD_NUMBER_CROP_CONFIDENCE_THRESHOLD = 0.65
const LLM_CACHE_MAX_SIZE = 50
const DB_CONCURRENCY_LIMIT = 5

// Module-level caches persist across dialog opens within the same browser session.
const llmSingleCache = new Map<string, RawScannedCard>()
const llmMultiCache = new Map<string, RawScannedCard[]>()

// ── Types ─────────────────────────────────────────────────────────────────────

export type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

type RawScannedCard = {
  name?: string
  englishName?: string
  language?: string
  evolutionStage?: string
  set?: string
  cardNumber?: string
  rarity?: string
  type?: string
  confidence?: number
  reason?: string
  boundingBox?: BoundingBox
}

export type ScannedCardDraft = Omit<PokemonCard, 'id' | 'quantity' | 'dateAdded'> & {
  recognitionConfidence: number
  matchConfidence: number
  confidence: number
  selected: boolean
  reviewReason?: string
  previewImageUrl?: string
  sourceImageUrl?: string
  boundingBox?: BoundingBox
}

export type ScanQueueStatus = 'pending' | 'processing' | 'done' | 'error'

export type ScanQueueItem = {
  id: string
  /** Transient base64 data URL: populated during capture, empty once uploaded to server. */
  dataUrl: string
  /** Permanent server-side image URL: /api/scan-queue/{id}/image — used for thumbnails. */
  imageUrl: string
  status: ScanQueueStatus
  error?: string
  drafts?: ScannedCardDraft[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Maps common LLM rarity variants (lowercase) to their canonical value
const RARITY_ALIASES: Record<string, string> = {
  'holo': 'Holo Rare',
  'holo rare': 'Holo Rare',
  'holofoil rare': 'Holo Rare',
  'rare holo': 'Holo Rare',
  'ultra-rare': 'Ultra Rare',
  'secret': 'Secret Rare',
}

// Maps common LLM type variants (lowercase) to their canonical value
const TYPE_ALIASES: Record<string, string> = {
  'colourless': 'Colorless',
  'lightning': 'Electric',
  'dark': 'Darkness',
  'steel': 'Metal',
  'normal': 'Colorless',
}

// ── Exported helpers ──────────────────────────────────────────────────────────

export function isAutoAddEligible(confidence: number): boolean {
  return Math.round(confidence * 100) >= Math.round(AUTO_ADD_CONFIDENCE_THRESHOLD * 100)
}

export function confidencePercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function getConfidenceBadgeVariant(confidence: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (confidence >= 0.8) return 'secondary'
  if (confidence >= 0.65) return 'outline'
  return 'destructive'
}

export function getConfidenceBgClass(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-50 border-green-200'
  if (confidence >= 0.65) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

export function draftToPokemonCard(cardData: ScannedCardDraft): PokemonCard {
  const generatedId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  return {
    id: generatedId,
    name: cardData.name,
    set: cardData.set,
    cardNumber: cardData.cardNumber,
    pokedexNumber: cardData.pokedexNumber,
    rarity: cardData.rarity,
    type: cardData.type,
    supertype: cardData.supertype,
    imageUrl: cardData.imageUrl,
    largeImageUrl: cardData.largeImageUrl,
    prices: cardData.prices,
    tcgCardId: cardData.tcgCardId,
    quantity: 1,
    dateAdded: Date.now(),
  }
}

export function buildPricesFromTcgCard(tcgCard: unknown) {
  const card = tcgCard as Record<string, unknown> | null | undefined
  if (!card?.tcgplayer && !card?.cardmarket) return undefined

  const tcp = card.tcgplayer as Record<string, unknown> | undefined
  const cm = card.cardmarket as Record<string, unknown> | undefined
  const tcpPrices = tcp?.prices as Record<string, Record<string, number>> | undefined
  const cmPrices = cm?.prices as Record<string, number> | undefined

  return {
    tcgplayer: tcp ? {
      url: tcp.url as string | undefined,
      updatedAt: tcp.updatedAt as string | undefined,
      ...(tcpPrices?.normal?.market && { market: tcpPrices.normal.market }),
      ...(tcpPrices?.normal?.low && { low: tcpPrices.normal.low }),
      ...(tcpPrices?.normal?.mid && { mid: tcpPrices.normal.mid }),
      ...(tcpPrices?.normal?.high && { high: tcpPrices.normal.high }),
      ...(tcpPrices?.holofoil?.market && { holofoil: tcpPrices.holofoil.market }),
      ...(tcpPrices?.reverseHolofoil?.market && { reverseHolofoil: tcpPrices.reverseHolofoil.market }),
      ...(tcpPrices?.['1stEditionHolofoil']?.market && { '1stEditionHolofoil': tcpPrices['1stEditionHolofoil'].market }),
      ...(tcpPrices?.['1stEditionNormal']?.market && { '1stEditionNormal': tcpPrices['1stEditionNormal'].market }),
    } : undefined,
    cardmarket: cm ? {
      url: cm.url as string | undefined,
      updatedAt: cm.updatedAt as string | undefined,
      ...(cmPrices?.averageSellPrice && { averageSellPrice: cmPrices.averageSellPrice }),
      ...(cmPrices?.lowPrice && { lowPrice: cmPrices.lowPrice }),
      ...(cmPrices?.trendPrice && { trendPrice: cmPrices.trendPrice }),
      ...(cmPrices?.germanProLow && { germanProLow: cmPrices.germanProLow }),
      ...(cmPrices?.suggestedPrice && { suggestedPrice: cmPrices.suggestedPrice }),
      ...(cmPrices?.reverseHoloSell && { reverseHoloSell: cmPrices.reverseHoloSell }),
      ...(cmPrices?.reverseHoloLow && { reverseHoloLow: cmPrices.reverseHoloLow }),
      ...(cmPrices?.reverseHoloTrend && { reverseHoloTrend: cmPrices.reverseHoloTrend }),
      ...(cmPrices?.lowPriceExPlus && { lowPriceExPlus: cmPrices.lowPriceExPlus }),
      ...(cmPrices?.avg1 && { avg1: cmPrices.avg1 }),
      ...(cmPrices?.avg7 && { avg7: cmPrices.avg7 }),
      ...(cmPrices?.avg30 && { avg30: cmPrices.avg30 }),
      ...(cmPrices?.reverseHoloAvg1 && { reverseHoloAvg1: cmPrices.reverseHoloAvg1 }),
      ...(cmPrices?.reverseHoloAvg7 && { reverseHoloAvg7: cmPrices.reverseHoloAvg7 }),
      ...(cmPrices?.reverseHoloAvg30 && { reverseHoloAvg30: cmPrices.reverseHoloAvg30 }),
    } : undefined,
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function resizeDataUrlForInference(
  dataUrl: string,
  maxSide: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) {
        resolve(dataUrl)
        return
      }

      const largestSide = Math.max(width, height)
      const scale = largestSide > maxSide ? maxSide / largestSide : 1
      const targetWidth = Math.max(1, Math.round(width * scale))
      const targetHeight = Math.max(1, Math.round(height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }

      ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveListValue(value: string | undefined, allowed: readonly string[], aliases: Record<string, string>): string | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  const aliased = aliases[normalized]
  if (aliased) return aliased
  return allowed.find(v => v.toLowerCase() === normalized)
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function clampNormalizedBoxValue(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1000, value))
}

function normalizeBoundingBox(value: unknown): BoundingBox | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<BoundingBox>
  const x = clampNormalizedBoxValue(candidate.x)
  const y = clampNormalizedBoxValue(candidate.y)
  const width = clampNormalizedBoxValue(candidate.width)
  const height = clampNormalizedBoxValue(candidate.height)
  if (width <= 0 || height <= 0) return undefined
  return { x, y, width, height }
}

function normalizeSearchValue(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function parsePrintedTotal(cardNumber: string | undefined): number | null {
  if (!cardNumber) return null
  const parts = cardNumber.split('/')
  if (parts.length < 2) return null
  const rawTotal = parts[1]?.trim()
  if (!rawTotal || !/^\d+$/.test(rawTotal)) return null
  return Number(rawTotal)
}

function parseCardNumberNumerator(cardNumber: string | undefined): string {
  if (!cardNumber) return ''
  const numerator = cardNumber.split('/')[0]?.trim() || ''
  if (!numerator) return ''
  if (/^\d+$/.test(numerator)) return String(Number(numerator))
  if (!/\d/.test(numerator)) return ''
  return numerator.toUpperCase()
}

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true
  const v = value.trim().toLowerCase()
  return v === '' || v === '?' || v === '??' || v === 'unknown' || v === 'unknown set' ||
    v === 'n/a' || v === 'none' || v === 'unidentified'
}

function isNameCompatible(candidateName: string, rawName: string): boolean {
  const c = normalizeSearchValue(candidateName)
  const r = normalizeSearchValue(rawName)
  if (!c || !r || c.length < 3 || r.length < 3) return false
  return c === r || c.includes(r) || r.includes(c)
}

function normalizeEvolutionStage(value: string | undefined): 'basic' | 'stage1' | 'stage2' | '' {
  const normalized = normalizeSearchValue(value)
  if (!normalized) return ''
  if (normalized.includes('basic')) return 'basic'
  if (normalized.includes('stage 2') || normalized.includes('stage2')) return 'stage2'
  if (normalized.includes('stage 1') || normalized.includes('stage1')) return 'stage1'
  return ''
}

function getCandidateEvolutionStage(candidate: TCGCard): 'basic' | 'stage1' | 'stage2' | '' {
  const subtypes = candidate.subtypes || []
  for (const subtype of subtypes) {
    const normalized = normalizeEvolutionStage(subtype)
    if (normalized) return normalized
  }
  return ''
}

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()))
  return results
}

async function refineCardNumberFromCrop(
  cropDataUrl: string,
): Promise<{ cardNumber: string | null; setCode: string | null; confidence: number }> {
  try {
    const body = {
      messages: [
        { role: 'system', content: 'You are a Pokémon TCG card reader specialist. Read small printed text accurately.' },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This is a high-resolution crop of the BOTTOM portion of a Pokémon TCG card.
Your only job is to read the card number and set code printed in this area.

Return ONLY this JSON:
{
  "cardNumber": "The full card number as printed (e.g., 025/102, SV001/SV122, SWSH001). Include all characters and leading zeros.",
  "setCode": "The set abbreviation/code if clearly visible (e.g., SV, SSH, XY, BW, SM)",
  "confidence": 0.0-1.0
}
If the card number is completely unreadable, return: {"cardNumber": null, "setCode": null, "confidence": 0}`,
            },
            { type: 'image_url', image_url: { url: cropDataUrl } },
          ],
        },
      ],
      model: CARD_ANALYSIS_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 80,
      temperature: 0.05,
    }

    const resp = await fetch(SCAN_PROXY_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    })
    if (!resp.ok) return { cardNumber: null, setCode: null, confidence: 0 }

    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(data.choices[0].message.content)
    return {
      cardNumber: typeof parsed.cardNumber === 'string' ? parsed.cardNumber.trim() : null,
      setCode: typeof parsed.setCode === 'string' ? parsed.setCode.trim() : null,
      confidence: clampConfidence(parsed.confidence, 0),
    }
  } catch {
    return { cardNumber: null, setCode: null, confidence: 0 }
  }
}

function scoreDatabaseCandidate(candidate: TCGCard, raw: RawScannedCard): number {
  const candidateName = normalizeSearchValue(candidate.name)
  const rawName = normalizeSearchValue(raw.englishName || raw.name)
  const rawNameAlt = raw.englishName ? normalizeSearchValue(raw.name) : ''
  const candidateSet = normalizeSearchValue(candidate.set.name)
  const rawSet = normalizeSearchValue(raw.set)
  const candidateNumber = normalizeSearchValue(candidate.number)
  const rawNumber = normalizeSearchValue(raw.cardNumber)
  const candidateType = normalizeSearchValue(candidate.types?.[0] || candidate.supertype)
  const rawType = normalizeSearchValue(raw.type)
  const candidateRarity = normalizeSearchValue(candidate.rarity)
  const rawRarity = normalizeSearchValue(raw.rarity)
  const candidateStage = getCandidateEvolutionStage(candidate)
  const rawStage = normalizeEvolutionStage(raw.evolutionStage)
  const rawTotal = parsePrintedTotal(raw.cardNumber)
  const candidateTotal = candidate.set?.printedTotal || candidate.set?.total || null
  const rawNumberNumerator = parseCardNumberNumerator(raw.cardNumber)
  const candidateNumberNumerator = parseCardNumberNumerator(candidate.number)

  let score = 0

  const nameScore = (() => {
    let s = 0
    if (rawName && candidateName === rawName) s = 10
    else if (rawName && candidateName.includes(rawName)) s = 6
    else if (rawName && rawName.includes(candidateName)) s = 4
    if (rawNameAlt) {
      if (rawNameAlt && candidateName === rawNameAlt) s = Math.max(s, 10)
      else if (rawNameAlt && candidateName.includes(rawNameAlt)) s = Math.max(s, 6)
      else if (rawNameAlt && rawNameAlt.includes(candidateName)) s = Math.max(s, 4)
    }
    return s
  })()
  score += nameScore

  if (rawSet && candidateSet === rawSet) score += 4
  else if (rawSet && rawSet.length >= 3 && candidateSet.includes(rawSet)) score += 2
  else if (rawSet && candidateSet.length >= 3 && rawSet.includes(candidateSet)) score += 1

  if (rawNumber && candidateNumber === rawNumber) score += 5
  else if (rawNumberNumerator && candidateNumberNumerator && rawNumberNumerator === candidateNumberNumerator) score += 4

  if (rawTotal && candidateTotal === rawTotal) score += 3
  else if (rawTotal && candidateTotal && candidateTotal !== rawTotal) score -= 4

  if (rawStage && candidateStage === rawStage) score += 2
  if (rawType && candidateType === rawType) score += 1
  if (rawRarity && candidateRarity === rawRarity) score += 1

  return score
}

async function resolveDatabaseMatch(
  raw: RawScannedCard,
  findCard: (name: string, setName?: string, cardNumber?: string) => Promise<TCGCard | null>,
  searchCards: (query: string, limit?: number) => Promise<TCGCard[]>,
): Promise<TCGCard | null> {
  const name = raw.name?.trim()
  const englishName = raw.englishName?.trim()
  const lookupName = englishName || name
  const setName = raw.set?.trim()
  const cardNumber = raw.cardNumber?.trim()

  if (!lookupName && !cardNumber) return null

  const effectiveSet = isPlaceholderValue(setName) ? undefined : setName
  const effectiveNumber = isPlaceholderValue(cardNumber) ? undefined : cardNumber

  const exactMatch = await findCard(lookupName || '', effectiveSet, effectiveNumber)
  if (exactMatch) return exactMatch

  const queryCandidates: string[] = lookupName ? [lookupName] : []
  if (effectiveNumber) queryCandidates.push(effectiveNumber)
  if (effectiveNumber && effectiveSet) queryCandidates.push(`${effectiveNumber} ${effectiveSet}`)
  const uniqueQueries = [...new Set(queryCandidates.map(q => q!.trim()).filter(Boolean))]
  const candidateMap = new Map<string, TCGCard>()

  const searchResults = await Promise.all(
    uniqueQueries.map(async (query) => {
      try {
        return await searchCards(query, 24)
      } catch {
        return [] as TCGCard[]
      }
    })
  )

  for (const found of searchResults) {
    for (const candidate of found) {
      candidateMap.set(candidate.id, candidate)
    }
  }

  const candidates = [...candidateMap.values()]
  if (candidates.length === 0) return null

  const bestCandidate = [...candidates]
    .map(candidate => ({ candidate, score: scoreDatabaseCandidate(candidate, raw) }))
    .sort((left, right) => right.score - left.score)[0]

  if (!bestCandidate || bestCandidate.score < 6) return null

  const rawName = (raw.englishName || raw.name || '').trim()
  if (rawName && !isNameCompatible(bestCandidate.candidate.name, rawName)) return null

  const rawNumerator = parseCardNumberNumerator(raw.cardNumber)
  const candidateNumerator = parseCardNumberNumerator(bestCandidate.candidate.number)
  if (rawNumerator && candidateNumerator && rawNumerator !== candidateNumerator) return null

  return bestCandidate.candidate
}

async function cropImageToBoundingBox(imageDataUrl: string, boundingBox?: BoundingBox): Promise<string> {
  if (!boundingBox) return imageDataUrl

  return await new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const sourceWidth = image.width
      const sourceHeight = image.height

      const left = Math.max(0, Math.floor((boundingBox.x / 1000) * sourceWidth))
      const top = Math.max(0, Math.floor((boundingBox.y / 1000) * sourceHeight))
      const width = Math.max(1, Math.floor((boundingBox.width / 1000) * sourceWidth))
      const height = Math.max(1, Math.floor((boundingBox.height / 1000) * sourceHeight))
      const cropWidth = Math.min(width, sourceWidth - left)
      const cropHeight = Math.min(height, sourceHeight - top)

      canvas.width = cropWidth
      canvas.height = cropHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(imageDataUrl); return }

      ctx.drawImage(image, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    image.onerror = () => resolve(imageDataUrl)
    image.src = imageDataUrl
  })
}

function buildDraftCard(
  raw: RawScannedCard,
  tcgCard: TCGCard | null,
  previewImageUrl?: string,
  sourceImageUrl?: string,
): ScannedCardDraft {
  const name = raw.name || 'Unknown'
  const set = raw.set || 'Unknown Set'
  const cardNumber = raw.cardNumber || '?'
  const rarity = resolveListValue(raw.rarity, RARITIES, RARITY_ALIASES) ?? 'Common'
  const type = resolveListValue(raw.type, TYPES, TYPE_ALIASES) ?? 'Colorless'

  let imageUrl = `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(name)}`
  let largeImageUrl: string | undefined
  if (tcgCard?.images?.small) imageUrl = tcgCard.images.small
  else if (tcgCard?.images?.large) imageUrl = tcgCard.images.large
  else if (previewImageUrl) imageUrl = previewImageUrl
  if (tcgCard?.images?.large) largeImageUrl = tcgCard.images.large

  const recognitionConfidence = clampConfidence(raw.confidence, 0.6)
  const matchConfidence = tcgCard ? 0.95 : 0.35
  const confidence = Math.min(recognitionConfidence, matchConfidence)

  return {
    name,
    set,
    cardNumber,
    pokedexNumber: tcgCard?.nationalPokedexNumbers?.[0],
    rarity,
    type,
    supertype: tcgCard?.supertype,
    imageUrl,
    largeImageUrl,
    prices: buildPricesFromTcgCard(tcgCard),
    tcgCardId: tcgCard?.id,
    recognitionConfidence,
    matchConfidence,
    confidence,
    selected: !!tcgCard && confidence >= LOW_CONFIDENCE_THRESHOLD,
    reviewReason: raw.reason,
    previewImageUrl,
    sourceImageUrl,
    boundingBox: raw.boundingBox,
  }
}

// ── Analysis functions (exported) ─────────────────────────────────────────────

export async function analyzeCardImage(
  imageDataUrl: string,
  findCard: (name: string, setName?: string, cardNumber?: string) => Promise<TCGCard | null>,
  searchCards: (query: string, limit?: number) => Promise<TCGCard[]>,
  qualityReport?: ImageQualityReport,
): Promise<ScannedCardDraft> {
  const cacheKey = imageDataUrlHash(imageDataUrl)
  let raw = llmSingleCache.get(cacheKey)

  if (!raw) {
    const sendUrl = qualityReport?.needsEnhancement
      ? await enhanceCardImage(imageDataUrl, qualityReport)
      : imageDataUrl

    const body = {
      messages: [
        {
          role: 'system',
          content: 'You are a Pokémon TCG card recognition expert. Analyze card images and return accurate JSON data.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this Pokémon card image carefully and return a JSON object with these fields.

Reading tips:
- Card NUMBER: small text at the BOTTOM of the card (e.g. "25/102"). Examine the lower section closely.
- Card NAME: large text at the top or middle. Include all variant words (ex, VMAX, V, GX, Radiant, Alolan, Galarian, etc.).
- Set SYMBOL and code appear at the bottom-center area.
- If glare, blur, or reflection obscures a field, give your best-effort reading and reduce confidence for that field only.

{
  "name": "Exact full card name as printed (include: ex, VMAX, V, GX, Radiant, Alolan, Galarian, etc.)",
  "englishName": "English equivalent for database matching. If already English, repeat the name.",
  "language": "Card language: English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, or Unknown",
  "evolutionStage": "Basic | Stage 1 | Stage 2 | Unknown",
  "set": "Set name (e.g., Base Set, Fossil, Sword & Shield, Scarlet & Violet, etc.)",
  "cardNumber": "Card number at the BOTTOM of the card (e.g., 25/102 or SV001/SV122). Read carefully — it is small text.",
  "rarity": "Common | Uncommon | Rare | Holo Rare | Ultra Rare | Secret Rare",
  "type": "Fire | Water | Grass | Electric | Psychic | Fighting | Darkness | Metal | Dragon | Fairy | Colorless",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation for uncertain fields if confidence < 0.8"
}
If this is not a Pokémon card or is completely unreadable, return: {"error": "Unable to identify card"}`,
            },
            {
              type: 'image_url',
              image_url: { url: sendUrl },
            },
          ],
        },
      ],
      model: CARD_ANALYSIS_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.1,
      top_p: 1.0,
    }

    const response = await fetch(SCAN_PROXY_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM request failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(data.choices[0].message.content)

    if (parsed.error) throw new Error(parsed.error)

    raw = {
      name: parsed.name || 'Unknown',
      englishName: parsed.englishName || parsed.name || 'Unknown',
      language: parsed.language,
      evolutionStage: parsed.evolutionStage,
      set: parsed.set || 'Unknown Set',
      cardNumber: parsed.cardNumber || '?',
      rarity: parsed.rarity,
      type: parsed.type,
      confidence: parsed.confidence,
      reason: parsed.reason,
    }

    llmSingleCache.set(cacheKey, raw)
    if (llmSingleCache.size > LLM_CACHE_MAX_SIZE) {
      llmSingleCache.delete(llmSingleCache.keys().next().value!)
    }
  }

  const hasCardNumber = raw.cardNumber && raw.cardNumber !== '?'
  const recognitionConfidence = clampConfidence(raw.confidence, 0.6)
  if (!hasCardNumber && recognitionConfidence < CARD_NUMBER_CROP_CONFIDENCE_THRESHOLD) {
    try {
      const bottomCrop = await extractCardBottomCrop(imageDataUrl)
      const refined = await refineCardNumberFromCrop(bottomCrop)
      if (refined.cardNumber && refined.confidence > 0.45) {
        raw = { ...raw, cardNumber: refined.cardNumber }
        llmSingleCache.set(cacheKey, raw)
      }
    } catch {
      // Non-fatal — continue with original recognition result.
    }
  }

  const tcgCard = await resolveDatabaseMatch(raw, findCard, searchCards)
  return buildDraftCard(raw, tcgCard, imageDataUrl, imageDataUrl)
}

export async function analyzeMultipleCardsImage(
  imageDataUrl: string,
  findCard: (name: string, setName?: string, cardNumber?: string) => Promise<TCGCard | null>,
  searchCards: (query: string, limit?: number) => Promise<TCGCard[]>,
  qualityReport?: ImageQualityReport,
): Promise<ScannedCardDraft[]> {
  const cacheKey = imageDataUrlHash(imageDataUrl)
  let rawCards = llmMultiCache.get(cacheKey)

  if (!rawCards) {
    const sendUrl = qualityReport?.needsEnhancement
      ? await enhanceCardImage(imageDataUrl, qualityReport)
      : imageDataUrl

    const body = {
      messages: [
        {
          role: 'system',
          content: 'You are a Pokémon TCG card recognition expert. Analyze card images and return accurate JSON data, including approximate card bounding boxes when multiple cards are present.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image and identify ALL visible Pokémon TCG cards.

Reading tips:
- Card NUMBER: small text at the BOTTOM of each card (e.g. "25/102"). Examine each card's bottom area closely.
- Card NAME: large text at top/middle. Include all variant words (ex, VMAX, V, GX, Radiant, Alolan, Galarian, etc.).
- Include partially visible or angled cards if you can identify them with reasonable confidence.
- Bounding boxes should tightly cover each card's visible region.

Return a JSON object with a "cards" array — one entry per card:
{
  "cards": [
    {
      "name": "Exact full card name as printed (include: ex, VMAX, V, GX, Radiant, Alolan, Galarian, etc.)",
      "englishName": "English equivalent for database matching. If already English, repeat the name.",
      "language": "Card language: English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, or Unknown",
      "evolutionStage": "Basic | Stage 1 | Stage 2 | Unknown",
      "set": "Set name (e.g., Base Set, Fossil, Sword & Shield, Scarlet & Violet, etc.)",
      "cardNumber": "Card number at the bottom of each card (e.g., 25/102). Read carefully — it is small text.",
      "rarity": "Common | Uncommon | Rare | Holo Rare | Ultra Rare | Secret Rare",
      "type": "Fire | Water | Grass | Electric | Psychic | Fighting | Darkness | Metal | Dragon | Fairy | Colorless",
      "confidence": 0.0-1.0,
      "reason": "Brief explanation for uncertain fields",
      "boundingBox": {
        "x": "left edge 0–1000",
        "y": "top edge 0–1000",
        "width": "card width 1–1000",
        "height": "card height 1–1000"
      }
    }
  ]
}
Cards may overlap, be rotated, or photographed at an angle. Include every identifiable card.
If no Pokémon cards are visible, return: {"cards": []}`,
            },
            {
              type: 'image_url',
              image_url: { url: sendUrl },
            },
          ],
        },
      ],
      model: CARD_ANALYSIS_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.1,
      top_p: 1.0,
    }

    const response = await fetch(SCAN_PROXY_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM request failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(data.choices[0].message.content)

    rawCards = Array.isArray(parsed.cards)
      ? parsed.cards.map((card: RawScannedCard) => ({
          ...card,
          boundingBox: normalizeBoundingBox(card.boundingBox),
        }))
      : []

    llmMultiCache.set(cacheKey, rawCards!)
    if (llmMultiCache.size > LLM_CACHE_MAX_SIZE) {
      llmMultiCache.delete(llmMultiCache.keys().next().value!)
    }
  }

  const identifiable = (rawCards ?? []).filter(card => {
    const name = card.name?.trim()
    return name && name.toLowerCase() !== 'unknown'
  })

  const results = await withConcurrency(
    identifiable.map((card) => async () => {
      const name = card.name!.trim()
      const englishName = card.englishName?.trim() || name
      const set = card.set?.trim() || 'Unknown Set'
      const cardNumber = card.cardNumber?.trim() || '?'
      const rawCard = { ...card, name, englishName, set, cardNumber }
      const tcgCard = await resolveDatabaseMatch(rawCard, findCard, searchCards)
      const previewImageUrl = await cropImageToBoundingBox(imageDataUrl, card.boundingBox)

      return buildDraftCard(
        { name, englishName, language: card.language, set, cardNumber, rarity: card.rarity, type: card.type, confidence: card.confidence, reason: card.reason, boundingBox: card.boundingBox },
        tcgCard,
        previewImageUrl,
        imageDataUrl,
      )
    }),
    DB_CONCURRENCY_LIMIT,
  )

  return results
}

export async function analyzeBestSingleCard(
  imageDataUrl: string,
  findCard: (name: string, setName?: string, cardNumber?: string) => Promise<TCGCard | null>,
  searchCards: (query: string, limit?: number) => Promise<TCGCard[]>,
  qualityReport?: ImageQualityReport,
): Promise<ScannedCardDraft> {
  let singleCandidate: ScannedCardDraft | null = null

  try {
    singleCandidate = await analyzeCardImage(imageDataUrl, findCard, searchCards, qualityReport)
    if (singleCandidate.tcgCardId && singleCandidate.confidence >= SINGLE_FAST_PATH_CONFIDENCE) {
      return singleCandidate
    }
  } catch {
    // Fall through to multi-card parser.
  }

  const shouldTryMultiFallback = !singleCandidate || !singleCandidate.tcgCardId

  if (shouldTryMultiFallback) {
    try {
      const multi = await analyzeMultipleCardsImage(imageDataUrl, findCard, searchCards, qualityReport)
      if (multi.length > 0) {
        const bestMulti = multi.reduce((best, current) => {
          const bestScore = best.confidence + (best.tcgCardId ? 0.12 : 0)
          const currentScore = current.confidence + (current.tcgCardId ? 0.12 : 0)
          return currentScore > bestScore ? current : best
        })

        if (!singleCandidate) return bestMulti

        const singleScore = singleCandidate.confidence + (singleCandidate.tcgCardId ? 0.12 : 0)
        const multiScore = bestMulti.confidence + (bestMulti.tcgCardId ? 0.12 : 0)
        return multiScore > singleScore ? bestMulti : singleCandidate
      }
    } catch {
      // Keep single candidate, if any.
    }
  }

  if (!singleCandidate) {
    throw new Error('Could not identify a card from the captured image')
  }

  return singleCandidate
}

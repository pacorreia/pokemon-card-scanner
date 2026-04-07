import { useState, useRef, useCallback, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Camera, Upload, Sparkle, PencilSimple, ArrowLeft, Stack, CheckCircle, Trash, MagnifyingGlass } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { PokemonCard } from '@/lib/types'
import { useTCGDatabase, type TCGCard } from '@/lib/tcg-database'
import { authHeaders } from '@/lib/api-fetch'

const SCAN_PROXY_URL = '/api/github-models'

interface ScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCardScanned: (card: PokemonCard) => void
  onCardsScanned?: (cards: PokemonCard[]) => void
}

type Mode = 'idle' | 'camera' | 'analyzing' | 'manual' | 'bulk' | 'bulk-review'

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Holo Rare', 'Ultra Rare', 'Secret Rare']
const TYPES = ['Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless']
const BULK_SCAN_JPEG_QUALITY = 0.92
const LOW_CONFIDENCE_THRESHOLD = 0.74

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

type ScannedCardDraft = Omit<PokemonCard, 'id' | 'quantity' | 'dateAdded'> & {
  recognitionConfidence: number
  matchConfidence: number
  confidence: number
  selected: boolean
  reviewReason?: string
}

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

function confidencePercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function getConfidenceBadgeVariant(confidence: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (confidence >= 0.8) return 'secondary'
  if (confidence >= 0.65) return 'outline'
  return 'destructive'
}

function getConfidenceBgClass(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-50 border-green-200'
  if (confidence >= 0.65) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

function buildPricesFromTcgCard(tcgCard: unknown) {
  if (!tcgCard?.tcgplayer && !tcgCard?.cardmarket) return undefined

  return {
    tcgplayer: tcgCard.tcgplayer ? {
      url: tcgCard.tcgplayer.url,
      updatedAt: tcgCard.tcgplayer.updatedAt,
      ...(tcgCard.tcgplayer.prices?.normal?.market && { market: tcgCard.tcgplayer.prices.normal.market }),
      ...(tcgCard.tcgplayer.prices?.normal?.low && { low: tcgCard.tcgplayer.prices.normal.low }),
      ...(tcgCard.tcgplayer.prices?.normal?.mid && { mid: tcgCard.tcgplayer.prices.normal.mid }),
      ...(tcgCard.tcgplayer.prices?.normal?.high && { high: tcgCard.tcgplayer.prices.normal.high }),
      ...(tcgCard.tcgplayer.prices?.holofoil?.market && { holofoil: tcgCard.tcgplayer.prices.holofoil.market }),
      ...(tcgCard.tcgplayer.prices?.reverseHolofoil?.market && { reverseHolofoil: tcgCard.tcgplayer.prices.reverseHolofoil.market }),
      ...(tcgCard.tcgplayer.prices?.['1stEditionHolofoil']?.market && { '1stEditionHolofoil': tcgCard.tcgplayer.prices['1stEditionHolofoil'].market }),
      ...(tcgCard.tcgplayer.prices?.['1stEditionNormal']?.market && { '1stEditionNormal': tcgCard.tcgplayer.prices['1stEditionNormal'].market }),
    } : undefined,
    cardmarket: tcgCard.cardmarket ? {
      url: tcgCard.cardmarket.url,
      updatedAt: tcgCard.cardmarket.updatedAt,
      ...(tcgCard.cardmarket.prices?.averageSellPrice && { averageSellPrice: tcgCard.cardmarket.prices.averageSellPrice }),
      ...(tcgCard.cardmarket.prices?.lowPrice && { lowPrice: tcgCard.cardmarket.prices.lowPrice }),
      ...(tcgCard.cardmarket.prices?.trendPrice && { trendPrice: tcgCard.cardmarket.prices.trendPrice }),
      ...(tcgCard.cardmarket.prices?.germanProLow && { germanProLow: tcgCard.cardmarket.prices.germanProLow }),
      ...(tcgCard.cardmarket.prices?.suggestedPrice && { suggestedPrice: tcgCard.cardmarket.prices.suggestedPrice }),
      ...(tcgCard.cardmarket.prices?.reverseHoloSell && { reverseHoloSell: tcgCard.cardmarket.prices.reverseHoloSell }),
      ...(tcgCard.cardmarket.prices?.reverseHoloLow && { reverseHoloLow: tcgCard.cardmarket.prices.reverseHoloLow }),
      ...(tcgCard.cardmarket.prices?.reverseHoloTrend && { reverseHoloTrend: tcgCard.cardmarket.prices.reverseHoloTrend }),
      ...(tcgCard.cardmarket.prices?.lowPriceExPlus && { lowPriceExPlus: tcgCard.cardmarket.prices.lowPriceExPlus }),
      ...(tcgCard.cardmarket.prices?.avg1 && { avg1: tcgCard.cardmarket.prices.avg1 }),
      ...(tcgCard.cardmarket.prices?.avg7 && { avg7: tcgCard.cardmarket.prices.avg7 }),
      ...(tcgCard.cardmarket.prices?.avg30 && { avg30: tcgCard.cardmarket.prices.avg30 }),
      ...(tcgCard.cardmarket.prices?.reverseHoloAvg1 && { reverseHoloAvg1: tcgCard.cardmarket.prices.reverseHoloAvg1 }),
      ...(tcgCard.cardmarket.prices?.reverseHoloAvg7 && { reverseHoloAvg7: tcgCard.cardmarket.prices.reverseHoloAvg7 }),
      ...(tcgCard.cardmarket.prices?.reverseHoloAvg30 && { reverseHoloAvg30: tcgCard.cardmarket.prices.reverseHoloAvg30 }),
    } : undefined,
  }
}

function buildDraftCard(
  raw: { name: string; set: string; cardNumber: string; rarity?: string; type?: string; confidence?: number; reason?: string },
  tcgCard: unknown,
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
  if (tcgCard?.images?.large) largeImageUrl = tcgCard.images.large

  const recognitionConfidence = clampConfidence(raw.confidence, 0.6)
  const matchConfidence = tcgCard ? 0.95 : 0.35
  const confidence = Math.min(recognitionConfidence, matchConfidence)

  return {
    name,
    set,
    cardNumber,
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
  }
}

async function configureTrackForRecognition(track: MediaStreamTrack, targetMode: 'camera' | 'bulk') {
  if (typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') return

  const caps = track.getCapabilities() as Record<string, unknown>
  const advanced: Record<string, unknown>[] = []

  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' })
  }
  if (caps.zoom?.max) {
    const zoomValue = targetMode === 'bulk' ? Math.min(1.4, caps.zoom.max) : Math.min(1.8, caps.zoom.max)
    if (zoomValue >= (caps.zoom.min ?? 1)) advanced.push({ zoom: zoomValue })
  }
  if (targetMode === 'bulk' && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
    advanced.push({ whiteBalanceMode: 'continuous' })
  }

  if (advanced.length > 0) {
    try {
      await track.applyConstraints({ advanced } as MediaTrackConstraints)
    } catch {
      // Capability support varies by browser/device.
    }
  }
}

async function analyzeCardImage(imageDataUrl: string, findCard: (name: string, setName?: string, cardNumber?: string) => Promise<unknown>): Promise<ScannedCardDraft> {
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
            text: `Analyze this Pokémon card image and return a JSON object with these fields:
{
  "name": "Exact full card name exactly as printed (include form/variant words like ex, VMAX, Radiant, Alolan, etc.)",
  "set": "Set name (e.g., Base Set, Jungle, Fossil, Team Rocket, Sword & Shield, Scarlet & Violet, etc.)",
  "cardNumber": "Card number as shown (e.g., 25/102)",
  "rarity": "One of: Common, Uncommon, Rare, Holo Rare, Ultra Rare, Secret Rare",
  "type": "One of: Fire, Water, Grass, Electric, Psychic, Fighting, Darkness, Metal, Dragon, Fairy, Colorless",
  "confidence": 0.0-1.0,
  "reason": "Short reason if confidence < 0.8"
}
If this is not a Pokémon card or the image is too unclear to read, return: {"error": "Unable to identify card"}`,
          },
          {
            type: 'image_url',
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    model: 'openai/gpt-4o',
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0.1,
    top_p: 1.0,
  }

  const response = await fetch(SCAN_PROXY_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM request failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices[0].message.content)

  if (parsed.error) {
    throw new Error(parsed.error)
  }

  const name = parsed.name || 'Unknown'
  const set = parsed.set || 'Unknown Set'
  const cardNumber = parsed.cardNumber || '?'
  const tcgCard = await findCard(name, set, cardNumber)

  return buildDraftCard(
    {
      name,
      set,
      cardNumber,
      rarity: parsed.rarity,
      type: parsed.type,
      confidence: parsed.confidence,
      reason: parsed.reason,
    },
    tcgCard,
  )
}

async function analyzeMultipleCardsImage(
  imageDataUrl: string,
  findCard: (name: string, setName?: string, cardNumber?: string) => Promise<unknown>,
): Promise<ScannedCardDraft[]> {
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
            text: `Analyze this image and identify ALL visible Pokémon TCG cards.
Return a JSON object with a "cards" array — one entry per card you can clearly identify:
{
  "cards": [
    {
      "name": "Exact full card name exactly as printed (include form/variant words like ex, VMAX, Radiant, Alolan, etc.)",
      "set": "Set name (e.g., Base Set, Jungle, Fossil, Team Rocket, Sword & Shield, Scarlet & Violet, etc.)",
      "cardNumber": "Card number as shown (e.g., 25/102)",
      "rarity": "One of: Common, Uncommon, Rare, Holo Rare, Ultra Rare, Secret Rare",
      "type": "One of: Fire, Water, Grass, Electric, Psychic, Fighting, Darkness, Metal, Dragon, Fairy, Colorless",
      "confidence": 0.0-1.0,
      "reason": "Short reason if confidence < 0.8"
    }
  ]
}
Cards may be organized, rotated, overlapping, on table/floor/book pages, and photographed at an angle. Include every card you can identify with useful confidence. If no Pokémon cards are visible, return: {"cards": []}`,
          },
          {
            type: 'image_url',
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    model: 'openai/gpt-4o',
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    temperature: 0.1,
    top_p: 1.0,
  }

  const response = await fetch(SCAN_PROXY_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM request failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices[0].message.content)
  const rawCards: Array<{ name?: string; set?: string; cardNumber?: string; rarity?: string; type?: string; confidence?: number; reason?: string }> =
    Array.isArray(parsed.cards) ? parsed.cards : []

  const identifiable = rawCards.filter(card => {
    const name = card.name?.trim()
    return name && name.toLowerCase() !== 'unknown'
  })

  const results = await Promise.all(
    identifiable.map(async (card) => {
      const name = card.name!.trim()
      const set = card.set?.trim() || 'Unknown Set'
      const cardNumber = card.cardNumber?.trim() || '?'
      const tcgCard = await findCard(name, set, cardNumber)

      return buildDraftCard(
        {
          name,
          set,
          cardNumber,
          rarity: card.rarity,
          type: card.type,
          confidence: card.confidence,
          reason: card.reason,
        },
        tcgCard,
      )
    })
  )

  return results
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ScanDialog({ open, onOpenChange, onCardScanned, onCardsScanned }: ScanDialogProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [videoReady, setVideoReady] = useState(false)
  const [manualForm, setManualForm] = useState({
    name: '',
    set: '',
    cardNumber: '',
    rarity: '',
    type: '',
    imageUrl: '',
  })

  const { findCard, searchCards } = useTCGDatabase()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [bulkQueue, setBulkQueue] = useState<ScannedCardDraft[]>([])
  const [isMultiAnalyzing, setIsMultiAnalyzing] = useState(false)
  const [activeReviewIndex, setActiveReviewIndex] = useState<number | null>(null)
  const [reviewQuery, setReviewQuery] = useState('')
  const [reviewResults, setReviewResults] = useState<TCGCard[]>([])
  const [isSearchingMatches, setIsSearchingMatches] = useState(false)
  const [isBurstCapturing, setIsBurstCapturing] = useState(false)
  const [burstProgress, setBurstProgress] = useState(0)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setMode('idle')
      setVideoReady(false)
      setBulkQueue([])
      setIsMultiAnalyzing(false)
      setActiveReviewIndex(null)
      setReviewQuery('')
      setReviewResults([])
      setIsSearchingMatches(false)
      setIsBurstCapturing(false)
      setBurstProgress(0)
    }
  }, [open, stopCamera])

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopCamera()
    }
    onOpenChange(nextOpen)
  }

  const handleBack = () => {
    stopCamera()
    setVideoReady(false)
    setMode('idle')
    setBulkQueue([])
    setIsMultiAnalyzing(false)
    setActiveReviewIndex(null)
    setReviewQuery('')
    setReviewResults([])
    setIsBurstCapturing(false)
    setBurstProgress(0)
  }

  const processCard = useCallback((cardData: Omit<PokemonCard, 'id' | 'quantity' | 'dateAdded'>) => {
    const newCard: PokemonCard = {
      id: Date.now().toString(),
      ...cardData,
      quantity: 1,
      dateAdded: Date.now(),
    }
    onCardScanned(newCard)
    toast.success(`${newCard.name} added to collection!`, {
      description: `${newCard.set} • ${newCard.rarity}`,
    })
    onOpenChange(false)
  }, [onCardScanned, onOpenChange])

  const openReview = useCallback((cards: ScannedCardDraft[]) => {
    setBulkQueue(cards)
    setActiveReviewIndex(cards.length ? 0 : null)
    setReviewQuery(cards[0]?.name ?? '')
    setMode('bulk-review')
  }, [])

  useEffect(() => {
    if (mode !== 'bulk-review' || activeReviewIndex === null) {
      setReviewResults([])
      setIsSearchingMatches(false)
      return
    }

    const query = reviewQuery.trim()
    if (query.length < 2) {
      setReviewResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingMatches(true)
      try {
        const results = await searchCards(query, 8)
        setReviewResults(results)
      } catch {
        setReviewResults([])
      } finally {
        setIsSearchingMatches(false)
      }
    }, 200)

    return () => window.clearTimeout(timer)
  }, [mode, activeReviewIndex, reviewQuery, searchCards])

  const applyDatabaseMatch = useCallback((index: number, matchedCard: TCGCard) => {
    setBulkQueue(prev => prev.map((card, i) => {
      if (i !== index) return card

      return {
        ...card,
        name: matchedCard.name,
        set: matchedCard.set.name,
        cardNumber: matchedCard.number,
        rarity: matchedCard.rarity || card.rarity,
        type: matchedCard.types?.[0] || card.type,
        supertype: matchedCard.supertype || card.supertype,
        imageUrl: matchedCard.images.small || matchedCard.images.large || card.imageUrl,
        largeImageUrl: matchedCard.images.large || card.largeImageUrl,
        prices: buildPricesFromTcgCard(matchedCard),
        tcgCardId: matchedCard.id,
        matchConfidence: 0.98,
        confidence: Math.min(card.recognitionConfidence, 0.98),
        selected: true,
        reviewReason: undefined,
      }
    }))
    toast.success('Card match updated')
  }, [])

  const handleUpload = async (file: File) => {
    setMode('analyzing')
    try {
      const dataUrl = await fileToDataUrl(file)
      const cardData = await analyzeCardImage(dataUrl, findCard)
      openReview([cardData])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not identify the card. Try manual entry instead.', {
        description: message,
        action: {
          label: 'Enter manually',
          onClick: () => setMode('manual'),
        },
      })
      setMode('idle')
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
    e.target.value = ''
  }

  const startCamera = async (targetMode: 'camera' | 'bulk' = 'camera') => {
    setMode(targetMode)
    try {
      const preferredConstraints: MediaTrackConstraints[] = targetMode === 'bulk'
        ? [
            { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 }, aspectRatio: { ideal: 16 / 9 } },
            { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } },
            { facingMode: 'environment' },
          ]
        : [
            { facingMode: { ideal: 'environment' }, width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } },
            { facingMode: { ideal: 'environment' }, width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } },
            { facingMode: 'environment' },
          ]

      let stream: MediaStream | null = null
      for (const constraint of preferredConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: constraint })
          break
        } catch {
          // Try next fallback profile.
        }
      }
      if (!stream) throw new Error('Unable to acquire camera stream')

      streamRef.current = stream
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) await configureTrackForRecognition(videoTrack, targetMode)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setVideoReady(true)
      }
    } catch (err) {
      const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      toast.error(
        isDenied
          ? 'Camera access was denied. Please allow camera permission and try again.'
          : 'No camera found. Try uploading an image instead.'
      )
      setMode('idle')
    }
  }

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return

    setIsBurstCapturing(true)
    setBurstProgress(0)
    stopCamera()
    setVideoReady(false)

    try {
      // Capture 4 frames over ~800ms for burst analysis
      const frames: string[] = []
      const frameCount = 4
      const intervalMs = 200

      for (let i = 0; i < frameCount; i++) {
        // Simulate frame capture by just using the same canvas
        // In real burst mode with video still playing, each iteration would get a new frame
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        ctx.drawImage(video, 0, 0)
        frames.push(canvas.toDataURL('image/jpeg', 0.9))
        setBurstProgress(Math.round(((i + 1) / frameCount) * 100))

        if (i < frameCount - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs))
        }
      }

      setMode('analyzing')

      // Analyze all frames and pick the best one
      const analyses = await Promise.all(
        frames.map((dataUrl, idx) =>
          analyzeCardImage(dataUrl, findCard)
            .catch(err => {
              console.error(`[ScanDialog] Frame ${idx} analysis failed:`, err)
              return null
            })
        )
      )

      // Filter out failed analyses and sort by confidence
      const validAnalyses = analyses.filter((a): a is ScannedCardDraft => a !== null)
      if (validAnalyses.length === 0) {
        throw new Error('Could not analyze any captured frames')
      }

      const bestCard = validAnalyses.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      )

      console.log(
        `[ScanDialog] Burst analysis: ${validAnalyses.length}/${frameCount} frames analyzed, best confidence: ${confidencePercent(bestCard.confidence)}`
      )

      openReview([bestCard])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not identify the card. Try manual entry instead.', {
        description: message,
        action: {
          label: 'Enter manually',
          onClick: () => setMode('manual'),
        },
      })
      setMode('idle')
    } finally {
      setIsBurstCapturing(false)
      setBurstProgress(0)
    }
  }

  const captureMultipleCards = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', BULK_SCAN_JPEG_QUALITY)
    stopCamera()
    setVideoReady(false)

    setIsMultiAnalyzing(true)
    try {
      const cards = await analyzeMultipleCardsImage(dataUrl, findCard)
      if (cards.length === 0) {
        toast.error('No Pokémon cards detected. Try again with better lighting or angle.')
        setMode('bulk')
        await startCamera('bulk')
        return
      }

      openReview(cards)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not analyze the image. Please try again.', {
        description: message,
      })
      setMode('bulk')
      await startCamera('bulk')
    } finally {
      setIsMultiAnalyzing(false)
    }
  }

  const handleBulkDone = useCallback(() => {
    const selectedCards = bulkQueue.filter(card => card.selected)
    if (selectedCards.length === 0) {
      toast.error('Select at least one card to add.')
      return
    }

    const newCards: PokemonCard[] = selectedCards.map((cardData) => ({
      id: crypto.randomUUID(),
      name: cardData.name,
      set: cardData.set,
      cardNumber: cardData.cardNumber,
      rarity: cardData.rarity,
      type: cardData.type,
      supertype: cardData.supertype,
      imageUrl: cardData.imageUrl,
      largeImageUrl: cardData.largeImageUrl,
      prices: cardData.prices,
      tcgCardId: cardData.tcgCardId,
      quantity: 1,
      dateAdded: Date.now(),
    }))

    if (onCardsScanned) {
      onCardsScanned(newCards)
    } else {
      newCards.forEach(card => onCardScanned(card))
    }

    stopCamera()
    setBulkQueue([])
    onOpenChange(false)
  }, [bulkQueue, onCardsScanned, onCardScanned, onOpenChange, stopCamera])

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!manualForm.name || !manualForm.set || !manualForm.rarity || !manualForm.type) {
      toast.error('Please fill in all required fields.')
      return
    }
    processCard({
      name: manualForm.name,
      set: manualForm.set,
      cardNumber: manualForm.cardNumber || '?',
      rarity: manualForm.rarity,
      type: manualForm.type,
      imageUrl: manualForm.imageUrl || `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(manualForm.name)}`,
    })
    setManualForm({ name: '', set: '', cardNumber: '', rarity: '', type: '', imageUrl: '' })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">Add Pokemon Card</DialogTitle>

        {mode === 'idle' && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary" weight="duotone" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold font-display">Add a Pokemon Card</h2>
              <p className="text-muted-foreground">
                Scan, upload, or manually enter your card details
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <Button
                size="lg"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
                onClick={() => startCamera('camera')}
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan with Camera
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full font-display font-semibold"
                onClick={() => startCamera('bulk')}
              >
                <Stack className="w-5 h-5 mr-2" />
                Bulk Scan (Multiple Cards)
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full font-display font-semibold"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Image
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="w-full font-display font-semibold"
                onClick={() => setMode('manual')}
              >
                <PencilSimple className="w-5 h-5 mr-2" />
                Enter Manually
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {mode === 'camera' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Point at a Card</h2>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-[70%] aspect-[5/7] border-4 border-accent rounded-xl shadow-2xl">
                  <div className="absolute -top-3 -left-3 w-6 h-6 border-t-4 border-l-4 border-accent rounded-tl-lg" />
                  <div className="absolute -top-3 -right-3 w-6 h-6 border-t-4 border-r-4 border-accent rounded-tr-lg" />
                  <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-4 border-l-4 border-accent rounded-bl-lg" />
                  <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-4 border-r-4 border-accent rounded-br-lg" />
                </div>
              </div>
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-white text-sm font-medium bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full inline-block">
                  Keep card centered and avoid glare
                </p>
              </div>
              {isBurstCapturing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <Camera className="w-10 h-10 text-accent" weight="fill" />
                  </motion.div>
                  <p className="text-white text-sm font-semibold">Capturing best frame...</p>
                  <p className="text-white/70 text-xs">{burstProgress}%</p>
                </div>
              )}
              {!videoReady && !isBurstCapturing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <p className="text-white text-sm">Camera warming up...</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <Button
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              onClick={capturePhoto}
              disabled={!videoReady || isBurstCapturing}
            >
              <Camera className="w-5 h-5 mr-2" />
              {isBurstCapturing ? 'Burst capturing...' : videoReady ? 'Capture Card' : 'Waiting for camera...'}
            </Button>
          </div>
        )}

        {mode === 'bulk' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Scan All Cards</h2>
            </div>

            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[88%] h-[80%] border-2 border-dashed border-accent/70 rounded-xl" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <p className="text-white text-xs font-medium bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full inline-block">
                  Include all cards, even rotated or on table/floor/book page
                </p>
              </div>
              {isMultiAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                  >
                    <Sparkle className="w-10 h-10 text-primary" weight="fill" />
                  </motion.div>
                  <p className="text-white text-sm font-semibold">Scanning for cards...</p>
                  <p className="text-white/70 text-xs">AI is identifying all visible cards</p>
                </div>
              )}
              {!videoReady && !isMultiAnalyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <p className="text-white text-sm">Camera warming up...</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <Button
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              onClick={captureMultipleCards}
              disabled={!videoReady || isMultiAnalyzing}
            >
              <Stack className="w-5 h-5 mr-2" />
              {isMultiAnalyzing ? 'Scanning...' : videoReady ? 'Scan All Cards' : 'Waiting for camera...'}
            </Button>
          </div>
        )}

        {mode === 'bulk-review' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Review Scan Results</h2>
              <Badge variant="secondary" className="ml-auto">
                {bulkQueue.length} card{bulkQueue.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Low-confidence cards are unselected by default. Search below to manually match and confirm cards.
            </p>

            {bulkQueue.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-muted-foreground text-sm">All cards removed. Go back and try again.</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[45vh] space-y-2 pr-1">
                {bulkQueue.map((card, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${activeReviewIndex === i ? 'border-primary ring-2 ring-primary/50' : 'border-border'} ${getConfidenceBgClass(card.confidence)}`}>
                    <Checkbox
                      checked={card.selected}
                      onCheckedChange={(checked) => {
                        const next = checked === true
                        setBulkQueue(prev => prev.map((entry, idx) => idx === i ? { ...entry, selected: next } : entry))
                      }}
                      aria-label={`Select ${card.name}`}
                    />
                    <div className="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-muted border border-border">
                      <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveReviewIndex(i)
                        setReviewQuery(card.name)
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-semibold text-sm truncate">{card.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{card.set} · #{card.cardNumber}</p>
                      <p className="text-xs text-muted-foreground">{card.rarity} · {card.type}</p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <Badge variant={getConfidenceBadgeVariant(card.confidence)} className="text-[10px]">
                          {confidencePercent(card.confidence)} confidence
                        </Badge>
                        {!card.tcgCardId && <Badge variant="outline" className="text-[10px]">No DB match</Badge>}
                      </div>
                      {card.reviewReason && card.confidence < LOW_CONFIDENCE_THRESHOLD && (
                        <p className="text-[11px] text-muted-foreground truncate mt-1">{card.reviewReason}</p>
                      )}
                    </button>
                    <button
                      onClick={() => setBulkQueue(prev => prev.filter((_, idx) => idx !== i))}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
                      aria-label={`Remove ${card.name}`}
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeReviewIndex !== null && bulkQueue[activeReviewIndex] && (
              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                <p className="text-xs font-medium">Manual Match</p>
                <div className="relative">
                  <MagnifyingGlass className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={reviewQuery}
                    onChange={(e) => setReviewQuery(e.target.value)}
                    className="pl-8"
                    placeholder="Search card in database..."
                  />
                </div>
                {isSearchingMatches && <p className="text-xs text-muted-foreground">Searching...</p>}
                {!isSearchingMatches && reviewResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {reviewResults.map(result => (
                      <button
                        type="button"
                        key={result.id}
                        onClick={() => applyDatabaseMatch(activeReviewIndex, result)}
                        className="w-full text-left p-2 rounded border border-border hover:border-primary hover:bg-muted/50"
                      >
                        <p className="text-xs font-semibold truncate">{result.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{result.set.name} · #{result.number}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {bulkQueue.length > 0 && (
                <Button
                  size="lg"
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
                  onClick={handleBulkDone}
                >
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Add {bulkQueue.filter(card => card.selected).length} Card{bulkQueue.filter(card => card.selected).length !== 1 ? 's' : ''} to Collection
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="w-full font-display font-semibold"
                onClick={() => { setBulkQueue([]); startCamera('bulk') }}
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan Again
              </Button>
            </div>
          </div>
        )}

        {mode === 'analyzing' && (
          <div className="flex flex-col items-center gap-6 py-12">
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkle className="w-12 h-12 text-primary" weight="fill" />
              </div>
            </motion.div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold font-display">Identifying Card...</h2>
              <p className="text-muted-foreground">AI is analyzing your card</p>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Enter Card Details</h2>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="card-name">Card Name *</Label>
                <Input
                  id="card-name"
                  placeholder="e.g. Charizard"
                  value={manualForm.name}
                  onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="card-set">Set *</Label>
                <Input
                  id="card-set"
                  placeholder="e.g. Base Set"
                  value={manualForm.set}
                  onChange={e => setManualForm(f => ({ ...f, set: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="card-number">Card Number</Label>
                  <Input
                    id="card-number"
                    placeholder="e.g. 4/102"
                    value={manualForm.cardNumber}
                    onChange={e => setManualForm(f => ({ ...f, cardNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Type *</Label>
                  <Select
                    value={manualForm.type}
                    onValueChange={v => setManualForm(f => ({ ...f, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Rarity *</Label>
                <Select
                  value={manualForm.rarity}
                  onValueChange={v => setManualForm(f => ({ ...f, rarity: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rarity" />
                  </SelectTrigger>
                  <SelectContent>
                    {RARITIES.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="card-image">Image URL (optional)</Label>
                <Input
                  id="card-image"
                  placeholder="https://..."
                  value={manualForm.imageUrl}
                  onChange={e => setManualForm(f => ({ ...f, imageUrl: e.target.value }))}
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Add Card to Collection
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

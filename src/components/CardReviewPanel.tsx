/**
 * CardReviewPanel — Shared two-column card review UI.
 *
 * Used by both ScanDialog (bulk-review mode) and ScanQueueDialog (review mode)
 * so the logic and markup only lives in one place.
 *
 * The parent owns the `cards` array and handles confirm/cancel actions.
 * Internal review state (active card, search query, DB results) is managed here.
 */
import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle, MagnifyingGlass, Trash } from '@phosphor-icons/react'
import { toast } from '@/lib/toast'
import { useTCGDatabase, type TCGCard } from '@/lib/tcg-database'
import {
  buildPricesFromTcgCard,
  confidencePercent,
  getConfidenceBadgeVariant,
  getConfidenceBgClass,
  LOW_CONFIDENCE_THRESHOLD,
  type ScannedCardDraft,
} from '@/lib/card-analysis'

export interface CardReviewPanelProps {
  cards: ScannedCardDraft[]
  onCardsChange: Dispatch<SetStateAction<ScannedCardDraft[]>>
  onConfirm: () => void
  /** Optional note shown under "Scanned Cards" heading. */
  scannedCardsNote?: string
  /** max-h value for the scrollable card lists. Defaults to '58vh'. */
  listMaxHeight?: string
  /** Extra buttons rendered below the confirm button (e.g. "Scan Again" or "Back to Queue"). */
  bottomActions?: React.ReactNode
}

export function CardReviewPanel({
  cards,
  onCardsChange,
  onConfirm,
  scannedCardsNote,
  listMaxHeight = '58vh',
  bottomActions,
}: CardReviewPanelProps) {
  const { searchCards } = useTCGDatabase()

  const [activeIndex, setActiveIndex]     = useState<number | null>(cards.length > 0 ? 0 : null)
  const [reviewQuery, setReviewQuery]     = useState(cards[0]?.name ?? '')
  const [reviewResults, setReviewResults] = useState<TCGCard[]>([])
  const [isSearching, setIsSearching]     = useState(false)

  // Clamp active index when cards are removed
  useEffect(() => {
    if (activeIndex !== null && activeIndex >= cards.length) {
      const next = cards.length > 0 ? 0 : null
      setActiveIndex(next)
      setReviewQuery(next !== null ? (cards[next]?.name ?? '') : '')
    }
  }, [cards.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced DB search
  useEffect(() => {
    if (activeIndex === null) { setReviewResults([]); setIsSearching(false); return }
    const query = reviewQuery.trim()
    if (query.length < 2) { setReviewResults([]); return }

    const timer = window.setTimeout(async () => {
      setIsSearching(true)
      try {
        setReviewResults(await searchCards(query, 8))
      } catch {
        setReviewResults([])
      } finally {
        setIsSearching(false)
      }
    }, 200)
    return () => window.clearTimeout(timer)
  }, [activeIndex, reviewQuery, searchCards])

  const applyMatch = useCallback((index: number, match: TCGCard) => {
    onCardsChange(prev => prev.map((card, i) => {
      if (i !== index) return card
      return {
        ...card,
        name:          match.name,
        set:           match.set.name,
        cardNumber:    match.number,
        pokedexNumber: match.nationalPokedexNumbers?.[0],
        rarity:        match.rarity || card.rarity,
        type:          match.types?.[0] || card.type,
        supertype:     match.supertype || card.supertype,
        imageUrl:      match.images.small || match.images.large || card.imageUrl,
        largeImageUrl: match.images.large || card.largeImageUrl,
        prices:        buildPricesFromTcgCard(match),
        tcgCardId:     match.id,
        confidence:    Math.min(card.recognitionConfidence ?? card.confidence, 0.98),
        selected:      true,
        reviewReason:  undefined,
      }
    }))
    toast.success('Card match updated')
  }, [onCardsChange])

  const removeCard = useCallback((index: number) => {
    onCardsChange(prev => prev.filter((_, i) => i !== index))
  }, [onCardsChange])

  const toggleSelected = useCallback((index: number, checked: boolean) => {
    onCardsChange(prev => prev.map((entry, i) => i === index ? { ...entry, selected: checked } : entry))
  }, [onCardsChange])

  const activeCard = activeIndex !== null ? cards[activeIndex] : null
  const selectedCount = cards.filter(c => c.selected).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Review scanned cards on the left and match them against database cards on the right.
      </p>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">All cards removed.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
          {/* ── Scanned cards column ──────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-muted/10">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-display text-base font-semibold">Scanned Cards</h3>
              {scannedCardsNote && (
                <p className="text-xs text-muted-foreground">{scannedCardsNote}</p>
              )}
            </div>
            <div className="space-y-2 overflow-y-auto p-3" style={{ maxHeight: listMaxHeight }}>
              {cards.map((card, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${activeIndex === i ? 'border-primary ring-2 ring-primary/50' : 'border-border'} ${getConfidenceBgClass(card.confidence)}`}
                >
                  <Checkbox
                    checked={card.selected}
                    onCheckedChange={(checked) => toggleSelected(i, checked === true)}
                    aria-label={`Select ${card.name}`}
                    className="mt-2"
                  />
                  <button
                    type="button"
                    onClick={() => { setActiveIndex(i); setReviewQuery(card.name) }}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm">
                      <img src={card.previewImageUrl || card.imageUrl} alt={card.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{card.name}</p>
                        {!card.tcgCardId && <Badge variant="outline" className="text-[10px]">Needs match</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{card.set} · #{card.cardNumber}</p>
                      <p className="text-xs text-muted-foreground">{card.rarity} · {card.type}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant={getConfidenceBadgeVariant(card.confidence)} className="text-[10px]">
                          {confidencePercent(card.confidence)} confidence
                        </Badge>
                        {card.tcgCardId && <Badge variant="secondary" className="text-[10px]">Database linked</Badge>}
                      </div>
                      {card.reviewReason && card.confidence < LOW_CONFIDENCE_THRESHOLD && (
                        <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{card.reviewReason}</p>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => removeCard(i)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${card.name}`}
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Database match column ─────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-muted/10">
            <div className="border-b border-border px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold">Database Matches</h3>
                  <p className="text-xs text-muted-foreground">
                    {activeCard ? `Matching for ${activeCard.name}` : 'Select a scanned card to match it.'}
                  </p>
                </div>
                {activeCard?.previewImageUrl && (
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm">
                    <img src={activeCard.previewImageUrl} alt={activeCard.name} className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
              <div className="relative">
                <MagnifyingGlass className="absolute left-2 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={reviewQuery}
                  onChange={(e) => setReviewQuery(e.target.value)}
                  className="pl-8"
                  placeholder="Search card in database..."
                />
              </div>
            </div>
            <div className="overflow-y-auto p-3" style={{ maxHeight: listMaxHeight }}>
              {isSearching && <p className="text-xs text-muted-foreground">Searching...</p>}
              {!isSearching && reviewResults.length === 0 && (
                <p className="text-xs text-muted-foreground">No database cards found for the current search.</p>
              )}
              {!isSearching && reviewResults.length > 0 && (
                <div className="space-y-2">
                  {reviewResults.map(result => (
                    <button
                      type="button"
                      key={result.id}
                      onClick={() => activeIndex !== null && applyMatch(activeIndex, result)}
                      className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50"
                    >
                      <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm">
                        <img src={result.images.small || result.images.large} alt={result.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{result.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{result.set.name} · #{result.number}</p>
                        <p className="text-xs text-muted-foreground">{result.rarity || 'Unknown rarity'} · {result.types?.[0] || result.supertype}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <Button
          size="lg"
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold shrink-0"
          onClick={onConfirm}
        >
          <CheckCircle className="w-5 h-5 mr-2" />
          Add {selectedCount} Card{selectedCount !== 1 ? 's' : ''} to Collection
        </Button>
      )}
      {bottomActions}
    </div>
  )
}

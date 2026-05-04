import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Minus, Trash, X, TrendUp, CurrencyDollar, ArrowSquareOut, ArrowsClockwise } from '@phosphor-icons/react'
import { CardDetailPresentation } from '@/components/shared/CardDetailPresentation'
import { CardReviewPanel } from '@/components/CardReviewPanel'
import { EvolutionChain } from '@/components/EvolutionChain'
import { getFriendlySetName } from '@/lib/set-display'
import { rarityColors, typeColors } from '@/lib/card-colors'
import { getCardById } from '@/lib/tcg-database'
import { buildPricesFromTcgCard, type ScannedCardDraft } from '@/lib/card-analysis'
import { api } from '@/lib/collection-api'
import type { PokemonCard, CardPrices } from '@/lib/types'
import type { TCGCard } from '@/lib/tcg-database'
import { toast } from '@/lib/toast'

interface CardDetailsSheetProps {
  card: PokemonCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateQuantity: (cardId: string, delta: number) => void
  onDelete: (cardId: string) => void
  onCardUpdate?: (cardId: string, patch: Partial<PokemonCard>) => void
  openRematch?: boolean
}

export function CardDetailsSheet({
  card,
  open,
  onOpenChange,
  onUpdateQuantity,
  onDelete,
  onCardUpdate,
  openRematch,
}: CardDetailsSheetProps) {
  const [zoomOpen, setZoomOpen] = useState(false)
  const [rematchOpen, setRematchOpen] = useState(false)
  const [rematchCards, setRematchCards] = useState<ScannedCardDraft[]>([])
  const [dbPrices, setDbPrices] = useState<CardPrices | undefined>(undefined)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [fullTcgCard, setFullTcgCard] = useState<TCGCard | null>(null)
  const [evoCard, setEvoCard] = useState<TCGCard | null>(null)

  // Fetch full TCGCard for prices (when missing) and evolution chain
  useEffect(() => {
    if (!card?.tcgCardId || !open) { setFullTcgCard(null); setDbPrices(undefined); setPricesLoading(false); return }
    if (!card.prices) setPricesLoading(true)
    const cardId = card.id
    const tcgCardId = card.tcgCardId
    let cancelled = false
    getCardById(tcgCardId).then(tcgCard => {
      if (cancelled) return
      setFullTcgCard(tcgCard)
      if (!card.prices) {
        const fetched = buildPricesFromTcgCard(tcgCard) ?? undefined
        setDbPrices(fetched)
        setPricesLoading(false)
        if (fetched) api.updateCard(cardId, { prices: fetched }).catch(() => {})
      }
    }).catch(() => { if (!cancelled) { setPricesLoading(false) } })
    return () => { cancelled = true }
  }, [card?.tcgCardId, card?.prices, card?.id, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open rematch panel when triggered from outside; reset when sheet closes
  useEffect(() => {
    if (open && openRematch) openRematchPanel()
    if (!open) { setRematchOpen(false); setEvoCard(null) }
  }, [open, openRematch]) // eslint-disable-line react-hooks/exhaustive-deps

  const openRematchPanel = () => {
    if (!card) return
    setRematchCards([{
      name: card.name,
      set: card.set,
      cardNumber: card.cardNumber,
      pokedexNumber: card.pokedexNumber,
      rarity: card.rarity,
      type: card.type,
      supertype: card.supertype,
      imageUrl: card.imageUrl,
      largeImageUrl: card.largeImageUrl,
      prices: card.prices,
      tcgCardId: card.tcgCardId,
      confidence: 1,
      previewImageUrl: card.imageUrl,
      selected: true,
    }])
    setRematchOpen(true)
  }

  const handleRematchConfirm = () => {
    const draft = rematchCards[0]
    if (!draft || !onCardUpdate || !card) { setRematchOpen(false); return }
    if (!card.id) { toast.error('Cannot update card: missing ID'); return }
    onCardUpdate(card.id, {
      name: draft.name,
      set: draft.set,
      cardNumber: draft.cardNumber,
      pokedexNumber: draft.pokedexNumber,
      rarity: draft.rarity,
      type: draft.type,
      supertype: draft.supertype,
      imageUrl: draft.imageUrl,
      largeImageUrl: draft.largeImageUrl,
      tcgCardId: draft.tcgCardId,
    })
    setRematchOpen(false)
  }

  if (!card) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-[85vh] max-h-[85vh] min-h-0 flex flex-col p-0 w-full max-w-2xl gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="font-display text-2xl">{evoCard?.name ?? card.name}</DialogTitle>
          </DialogHeader>

          <div className="relative flex-1 min-h-0">
            <div
              className="absolute inset-0 overflow-y-auto overscroll-contain"
              style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              {evoCard ? (
                <div className="px-4 pb-6 pt-2 space-y-4">
                  <Button variant="outline" size="sm" className="font-display font-semibold" onClick={() => setEvoCard(null)}>
                    ← Back to Card Details
                  </Button>
                  <div className="flex justify-center">
                    <div className="w-48 aspect-[2.5/3.5] rounded-lg overflow-hidden shadow-2xl bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 relative">
                      {(evoCard.images?.large || evoCard.images?.small) ? (
                        <img
                          src={evoCard.images.large || evoCard.images.small}
                          alt={evoCard.name}
                          className="w-full h-full object-cover absolute inset-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 text-white text-center font-bold font-display">{evoCard.name}</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
                    <div className="space-y-3">
                      {evoCard.supertype && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Supertype</span>
                          <span className="font-medium">{evoCard.supertype}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Set</span>
                        <span className="font-medium">{evoCard.set?.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Card Number</span>
                        <span className="font-medium">#{evoCard.number}{evoCard.set?.total ? `/${evoCard.set.total}` : ''}</span>
                      </div>
                      {evoCard.rarity && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Rarity</span>
                          <span className="font-medium">{evoCard.rarity}</span>
                        </div>
                      )}
                      {evoCard.types && evoCard.types.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Type</span>
                          <span className="font-medium">{evoCard.types.join(', ')}</span>
                        </div>
                      )}
                      {evoCard.hp && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm">HP</span>
                          <span className="font-medium">{evoCard.hp}</span>
                        </div>
                      )}
                      {evoCard.evolvesFrom && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Evolves From</span>
                          <span className="font-medium">{evoCard.evolvesFrom}</span>
                        </div>
                      )}
                      {evoCard.artist && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Artist</span>
                          <span className="font-medium">{evoCard.artist}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm">TCG Card ID</span>
                        <span className="font-mono text-xs text-muted-foreground">{evoCard.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : rematchOpen ? (
                <div className="px-4 pb-6 pt-2">
                  <CardReviewPanel
                    cards={rematchCards}
                    onCardsChange={setRematchCards}
                    onConfirm={handleRematchConfirm}
                    confirmLabel="Update Match"
                    scannedCardsTitle="Card to Re-match"
                    hideCardControls
                    listMaxHeight="40vh"
                    bottomActions={
                      <Button variant="outline" className="w-full font-display font-semibold" onClick={() => setRematchOpen(false)}>
                        ← Back to Card Details
                      </Button>
                    }
                  />
                </div>
              ) : (
              <CardDetailPresentation
                contentClassName="px-4 pb-24 space-y-6"
                image={(
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setZoomOpen(true)}
                      className="w-64 aspect-[2.5/3.5] rounded-lg overflow-hidden shadow-2xl cursor-pointer hover:shadow-3xl transition-shadow active:scale-[0.98] transition-transform relative bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400"
                    >
                      {(card.largeImageUrl || card.imageUrl) && !(card.largeImageUrl || card.imageUrl).includes('placehold.co') ? (
                        <img
                          src={card.largeImageUrl || card.imageUrl}
                          alt={card.name}
                          className="w-full h-full object-cover absolute inset-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-6 absolute inset-0">
                          <div className="text-center">
                            <div className="text-white text-2xl font-bold font-display mb-2 drop-shadow-lg">
                              {card.name}
                            </div>
                            <div className="text-white/80 text-sm drop-shadow">
                              No Image Available
                            </div>
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                )}
              >
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
                <div className="space-y-3">
                  {card.supertype && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Supertype</span>
                      <span className="font-medium">{card.supertype}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Set</span>
                    <span className="font-medium">{getFriendlySetName(card.set)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Card Number</span>
                    <span className="font-medium">#{card.cardNumber}</span>
                  </div>
                  {typeof card.pokedexNumber === 'number' && card.pokedexNumber > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">National Dex</span>
                      <span className="font-medium">#{card.pokedexNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Rarity</span>
                    <Badge className={`${rarityColors[card.rarity] || 'bg-gray-500'} text-white`}>
                      {card.rarity}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Type</span>
                    <Badge className={`${typeColors[card.type] || 'bg-gray-400'} text-white border-0`}>
                      {card.type}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Date Added</span>
                    <span className="font-medium">
                      {new Date(card.dateAdded).toLocaleDateString()}
                    </span>
                  </div>
                  {card.artist && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Artist</span>
                      <span className="font-medium">{card.artist}</span>
                    </div>
                  )}
                  {card.tcgCardId && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">TCG Card ID</span>
                      <span className="font-mono text-xs text-muted-foreground">{card.tcgCardId}</span>
                    </div>
                  )}
                </div>
              </div>

              {fullTcgCard && (
                <EvolutionChain
                  card={fullTcgCard}
                  onCardClick={(c) => setEvoCard(c)}
                />
              )}

              <Separator />

              {(() => {
                const prices = card.prices ?? dbPrices
                if (pricesLoading) return (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <ArrowsClockwise className="w-4 h-4 animate-spin" />
                    Loading prices…
                  </div>
                )
                if (!prices?.tcgplayer && !prices?.cardmarket) return null
                return (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                        <TrendUp className="w-4 h-4" />
                        Market Prices
                      </h3>
                      <div className="space-y-4">
                        {prices.tcgplayer && (
                          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm flex items-center gap-1.5">
                                <CurrencyDollar className="w-4 h-4" weight="bold" />
                                TCGPlayer
                              </span>
                              {prices.tcgplayer.url && (
                                <a
                                  href={prices.tcgplayer.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-xs flex items-center gap-1"
                                >
                                  View <ArrowSquareOut className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {prices.tcgplayer.market && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Market:</span>
                                  <span className="font-semibold">${prices.tcgplayer.market.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.tcgplayer.low && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Low:</span>
                                  <span className="font-medium">${prices.tcgplayer.low.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.tcgplayer.mid && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Mid:</span>
                                  <span className="font-medium">${prices.tcgplayer.mid.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.tcgplayer.high && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">High:</span>
                                  <span className="font-medium">${prices.tcgplayer.high.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.tcgplayer.holofoil && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Holofoil:</span>
                                  <span className="font-medium">${prices.tcgplayer.holofoil.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.tcgplayer.reverseHolofoil && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Reverse:</span>
                                  <span className="font-medium">${prices.tcgplayer.reverseHolofoil.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                            {prices.tcgplayer.updatedAt && (
                              <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                                Updated: {new Date(prices.tcgplayer.updatedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        )}

                        {prices.cardmarket && (
                          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm flex items-center gap-1.5">
                                <CurrencyDollar className="w-4 h-4" weight="bold" />
                                Cardmarket (€)
                              </span>
                              {prices.cardmarket.url && (
                                <a
                                  href={prices.cardmarket.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-xs flex items-center gap-1"
                                >
                                  View <ArrowSquareOut className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {prices.cardmarket.trendPrice && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Trend:</span>
                                  <span className="font-semibold">€{prices.cardmarket.trendPrice.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.cardmarket.averageSellPrice && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Avg Sell:</span>
                                  <span className="font-medium">€{prices.cardmarket.averageSellPrice.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.cardmarket.lowPrice && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Low:</span>
                                  <span className="font-medium">€{prices.cardmarket.lowPrice.toFixed(2)}</span>
                                </div>
                              )}
                              {prices.cardmarket.avg30 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">30d Avg:</span>
                                  <span className="font-medium">€{prices.cardmarket.avg30.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                            {prices.cardmarket.updatedAt && (
                              <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                                Updated: {new Date(prices.cardmarket.updatedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Separator />
                  </>
                )
              })()}

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Quantity</h3>
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onUpdateQuantity(card.id, -1)}
                    disabled={card.quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-3xl font-bold font-display min-w-[60px] text-center">
                    {card.quantity}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onUpdateQuantity(card.id, 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Re-match */}
              <Button
                variant="outline"
                className="w-full font-display font-semibold"
                onClick={openRematchPanel}
              >
                <ArrowsClockwise className="w-4 h-4 mr-2" />
                Re-match Card
              </Button>

              <Button
                variant="destructive"
                className="w-full font-display font-semibold"
                onClick={() => {
                  onDelete(card.id)
                  onOpenChange(false)
                }}
              >
                <Trash className="w-4 h-4 mr-2" />
                Remove from Collection
              </Button>
              </CardDetailPresentation>
              )}
          </div>
          </div>
      </DialogContent>
    </Dialog>

    <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
      <DialogContent className="max-w-full w-full h-full p-0 border-0 bg-black/95 flex items-center justify-center">
        <button
          onClick={() => setZoomOpen(false)}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-6 h-6" weight="bold" />
        </button>
        <div className="w-full max-w-2xl px-4">
          <div className="w-full aspect-[2.5/3.5] rounded-lg shadow-2xl relative bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 overflow-hidden">
            {(card.largeImageUrl || card.imageUrl) && !(card.largeImageUrl || card.imageUrl).includes('placehold.co') ? (
              <img
                src={card.largeImageUrl || card.imageUrl}
                alt={card.name}
                className="w-full h-full object-contain absolute inset-0"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-12 absolute inset-0">
                <div className="text-center">
                  <div className="text-white text-4xl font-bold font-display mb-4 drop-shadow-lg">
                    {card.name}
                  </div>
                  <div className="text-white/80 text-lg drop-shadow">
                    No Image Available
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

  </>
  )
}

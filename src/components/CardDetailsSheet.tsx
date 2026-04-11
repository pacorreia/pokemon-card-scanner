import { useState, useEffect, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, Minus, Trash, X, TrendUp, CurrencyDollar, ArrowSquareOut, MagnifyingGlass, ArrowsClockwise, CheckCircle, Warning } from '@phosphor-icons/react'
import { CardDetailPresentation } from '@/components/shared/CardDetailPresentation'
import { getFriendlySetName } from '@/lib/set-display'
import { rarityColors, typeColors } from '@/lib/card-colors'
import { useTCGDatabase, type TCGCard } from '@/lib/tcg-database'
import type { PokemonCard } from '@/lib/types'

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
  const [rematchQuery, setRematchQuery] = useState('')
  const [rematchResults, setRematchResults] = useState<TCGCard[]>([])
  const [rematchSearching, setRematchSearching] = useState(false)
  const [rematchApplied, setRematchApplied] = useState<string | null>(null)
  const rematchInputRef = useRef<HTMLInputElement>(null)
  const { searchCards } = useTCGDatabase()

  // Auto-open rematch panel when triggered from outside
  useEffect(() => {
    if (open && openRematch) setRematchOpen(true)
  }, [open, openRematch])

  // Seed search from current card name when panel opens
  useEffect(() => {
    if (rematchOpen && card) {
      setRematchQuery(card.name)
      setRematchResults([])
      setRematchApplied(null)
      setTimeout(() => rematchInputRef.current?.select(), 50)
    }
  }, [rematchOpen, card])

  // Debounced search
  useEffect(() => {
    if (!rematchOpen) return
    const q = rematchQuery.trim()
    if (q.length < 2) { setRematchResults([]); return }
    const timer = window.setTimeout(async () => {
      setRematchSearching(true)
      try {
        setRematchResults(await searchCards(q, 12))
      } catch {
        setRematchResults([])
      } finally {
        setRematchSearching(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [rematchQuery, rematchOpen, searchCards])

  const applyRematch = (tcgCard: TCGCard) => {
    if (!card || !onCardUpdate) return
    const patch: Partial<PokemonCard> = {
      name: tcgCard.name,
      set: tcgCard.set.name,
      cardNumber: tcgCard.number,
      pokedexNumber: tcgCard.nationalPokedexNumbers?.[0],
      rarity: tcgCard.rarity || card.rarity,
      type: tcgCard.types?.[0] || card.type,
      supertype: tcgCard.supertype || card.supertype,
      imageUrl: tcgCard.images.small || tcgCard.images.large || card.imageUrl,
      largeImageUrl: tcgCard.images.large || undefined,
      tcgCardId: tcgCard.id,
    }
    onCardUpdate(card.id, patch)
    setRematchApplied(tcgCard.id)
  }

  if (!card) return null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] min-h-0 flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <SheetTitle className="font-display text-2xl">{card.name}</SheetTitle>
          </SheetHeader>

          <div className="relative flex-1 min-h-0">
            <div
              className="absolute inset-0 overflow-y-auto overscroll-contain"
              style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
            >
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
                </div>
              </div>

              <Separator />

              {(card.prices?.tcgplayer || card.prices?.cardmarket) && (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <TrendUp className="w-4 h-4" />
                      Market Prices
                    </h3>
                    <div className="space-y-4">
                      {card.prices.tcgplayer && (
                        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm flex items-center gap-1.5">
                              <CurrencyDollar className="w-4 h-4" weight="bold" />
                              TCGPlayer
                            </span>
                            {card.prices.tcgplayer.url && (
                              <a 
                                href={card.prices.tcgplayer.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-xs flex items-center gap-1"
                              >
                                View <ArrowSquareOut className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {card.prices.tcgplayer.market && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Market:</span>
                                <span className="font-semibold">${card.prices.tcgplayer.market.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.tcgplayer.low && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Low:</span>
                                <span className="font-medium">${card.prices.tcgplayer.low.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.tcgplayer.mid && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Mid:</span>
                                <span className="font-medium">${card.prices.tcgplayer.mid.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.tcgplayer.high && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">High:</span>
                                <span className="font-medium">${card.prices.tcgplayer.high.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.tcgplayer.holofoil && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Holofoil:</span>
                                <span className="font-medium">${card.prices.tcgplayer.holofoil.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.tcgplayer.reverseHolofoil && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Reverse:</span>
                                <span className="font-medium">${card.prices.tcgplayer.reverseHolofoil.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                          {card.prices.tcgplayer.updatedAt && (
                            <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                              Updated: {new Date(card.prices.tcgplayer.updatedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {card.prices.cardmarket && (
                        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm flex items-center gap-1.5">
                              <CurrencyDollar className="w-4 h-4" weight="bold" />
                              Cardmarket (€)
                            </span>
                            {card.prices.cardmarket.url && (
                              <a 
                                href={card.prices.cardmarket.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-xs flex items-center gap-1"
                              >
                                View <ArrowSquareOut className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {card.prices.cardmarket.trendPrice && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Trend:</span>
                                <span className="font-semibold">€{card.prices.cardmarket.trendPrice.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.cardmarket.averageSellPrice && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Avg Sell:</span>
                                <span className="font-medium">€{card.prices.cardmarket.averageSellPrice.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.cardmarket.lowPrice && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Low:</span>
                                <span className="font-medium">€{card.prices.cardmarket.lowPrice.toFixed(2)}</span>
                              </div>
                            )}
                            {card.prices.cardmarket.avg30 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">30d Avg:</span>
                                <span className="font-medium">€{card.prices.cardmarket.avg30.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                          {card.prices.cardmarket.updatedAt && (
                            <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                              Updated: {new Date(card.prices.cardmarket.updatedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

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

              {/* Re-match panel */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full font-display font-semibold"
                  onClick={() => setRematchOpen(v => !v)}
                >
                  <ArrowsClockwise className="w-4 h-4 mr-2" />
                  Re-match Card
                </Button>

                {rematchOpen && (
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <div className="relative">
                      <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        ref={rematchInputRef}
                        value={rematchQuery}
                        onChange={e => setRematchQuery(e.target.value)}
                        placeholder="Search card name…"
                        className="pl-8 text-sm"
                      />
                    </div>

                    {rematchSearching && (
                      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                        <ArrowsClockwise className="w-4 h-4 animate-spin" />
                        Searching…
                      </div>
                    )}

                    {!rematchSearching && rematchResults.length === 0 && rematchQuery.trim().length >= 2 && (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Warning className="w-4 h-4" />
                        No results found
                      </div>
                    )}

                    {rematchResults.length > 0 && (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                        {rematchResults.map(tcgCard => (
                          <div
                            key={tcgCard.id}
                            role="button"
                            tabIndex={0}
                            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                            onClick={() => applyRematch(tcgCard)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                applyRematch(tcgCard)
                              }
                            }}
                          >
                            {tcgCard.images.small ? (
                              <img
                                src={tcgCard.images.small}
                                alt={tcgCard.name}
                                className="w-9 h-12 object-contain rounded flex-shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-9 h-12 bg-muted rounded flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{tcgCard.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{tcgCard.set.name} · #{tcgCard.number}</div>
                              {tcgCard.rarity && (
                                <div className="text-xs text-muted-foreground">{tcgCard.rarity}</div>
                              )}
                            </div>
                            {rematchApplied === tcgCard.id ? (
                              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" weight="fill" />
                            ) : (
                              <Button size="sm" variant="ghost" className="flex-shrink-0 text-xs h-7 px-2">
                                Apply
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
          </div>
          </div>
      </SheetContent>
    </Sheet>

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

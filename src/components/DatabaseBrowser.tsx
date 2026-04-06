import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { MagnifyingGlass, X, Package, SquaresFour, Warning, ArrowLeft } from '@phosphor-icons/react'
import { useTCGDatabase } from '@/lib/tcg-database'
import type { TCGCard, TCGSet } from '@/lib/tcg-database'

interface DatabaseBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const HEADER_HEIGHT = 52
const SEARCH_COUNT_HEIGHT = 32
const CARD_ROW_HEIGHT_3_COLS = 340
const CARD_ROW_HEIGHT_2_COLS = 480
const SET_ITEM_HEIGHT = 88
const VIRTUAL_PADDING_START = 16
const VIRTUAL_PADDING_END = 80
const MOBILE_BREAKPOINT = 640
const QUICK_FILTER_SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'] as const
type QuickFilterSupertype = typeof QUICK_FILTER_SUPERTYPES[number]

type VirtualRow =
  | { type: 'group-header'; label: string; count: number }
  | { type: 'card-row'; cards: TCGCard[] }
  | { type: 'search-count'; count: number }
  | { type: 'series-header'; label: string; count: number }
  | { type: 'set-item'; set: TCGSet }

export function DatabaseBrowser({ open, onOpenChange }: DatabaseBrowserProps) {
  const { getAllCards, sets, isLoaded, metadata } = useTCGDatabase()
  const [cards, setCards] = useState<TCGCard[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState<'cards' | 'sets'>('cards')
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null)
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [cols, setCols] = useState(3)
  const [selectedSupertypes, setSelectedSupertypes] = useState<QuickFilterSupertype[]>([])
  const parentRef = useRef<HTMLDivElement>(null)

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) setSelectedCard(null)
    onOpenChange(isOpen)
  }, [onOpenChange])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const updateCols = (matches: boolean) => {
      setCols(matches ? 2 : 3)
    }

    updateCols(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      updateCols(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    const loadCards = async () => {
      if (open && isLoaded && cards.length === 0 && !isLoadingCards) {
        setIsLoadingCards(true)
        try {
          console.log('[DatabaseBrowser] Loading cards from database...')
          const allCards = await getAllCards()
          console.log('[DatabaseBrowser] Loaded cards:', allCards.length)
          setCards(allCards)
        } catch (error) {
          console.error('[DatabaseBrowser] Failed to load cards:', error)
        } finally {
          setIsLoadingCards(false)
        }
      }
    }
    loadCards()
  }, [open, isLoaded])
  
  useEffect(() => {
    console.log('[DatabaseBrowser] State:', { 
      open, 
      isLoaded, 
      cardsLength: cards.length, 
      setsLength: sets.length,
      metadata 
    })
  }, [open, isLoaded, cards.length, sets.length, metadata])

  // Reset scroll when tab, search, or quick filters change
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0
    }
  }, [selectedTab, searchQuery, selectedSupertypes])

  const filteredCards = useMemo(() => {
    if (!cards || cards.length === 0) return []
    
    let result = cards

    if (selectedSupertypes.length > 0) {
      result = result.filter(card => card.supertype && selectedSupertypes.includes(card.supertype))
    }

    const query = searchQuery.toLowerCase()
    if (!query) return result
    
    return result.filter(card => {
      if (!card || !card.name) return false
      
      return (
        card.name.toLowerCase().includes(query) ||
        (card.set?.name && card.set.name.toLowerCase().includes(query)) ||
        (card.number && card.number.toLowerCase().includes(query)) ||
        (card.types && card.types.some(type => type.toLowerCase().includes(query)))
      )
    })
  }, [cards, searchQuery, selectedSupertypes])

  const filteredSets = useMemo(() => {
    if (!sets || sets.length === 0) return []
    
    const query = searchQuery.toLowerCase()
    if (!query) return sets
    
    return sets.filter(set => {
      if (!set || !set.name) return false
      
      return (
        set.name.toLowerCase().includes(query) ||
        (set.series && set.series.toLowerCase().includes(query)) ||
        (set.id && set.id.toLowerCase().includes(query))
      )
    })
  }, [sets, searchQuery])

  const groupedByType = useMemo(() => {
    const groups: Record<string, TCGCard[]> = {}
    filteredCards.forEach(card => {
      if (!card) return
      const type = card.supertype || 'Other'
      if (!groups[type]) groups[type] = []
      groups[type].push(card)
    })
    return groups
  }, [filteredCards])

  const groupedBySeries = useMemo(() => {
    const groups: Record<string, TCGSet[]> = {}
    filteredSets.forEach(set => {
      if (!set) return
      const series = set.series || 'Other'
      if (!groups[series]) groups[series] = []
      groups[series].push(set)
    })
    return groups
  }, [filteredSets])

  const cardVirtualRows = useMemo((): VirtualRow[] => {
    if (filteredCards.length === 0) return []
    const rows: VirtualRow[] = []
    if (searchQuery) {
      rows.push({ type: 'search-count', count: filteredCards.length })
      for (let i = 0; i < filteredCards.length; i += cols) {
        rows.push({ type: 'card-row', cards: filteredCards.slice(i, i + cols) })
      }
    } else {
      Object.entries(groupedByType).forEach(([type, typeCards]) => {
        rows.push({ type: 'group-header', label: type, count: typeCards.length })
        for (let i = 0; i < typeCards.length; i += cols) {
          rows.push({ type: 'card-row', cards: typeCards.slice(i, i + cols) })
        }
      })
    }
    return rows
  }, [filteredCards, groupedByType, searchQuery, cols])

  const setVirtualRows = useMemo((): VirtualRow[] => {
    if (filteredSets.length === 0) return []
    const rows: VirtualRow[] = []
    Object.entries(groupedBySeries).forEach(([series, seriesSets]) => {
      rows.push({ type: 'series-header', label: series, count: seriesSets.length })
      seriesSets.forEach(set => rows.push({ type: 'set-item', set }))
    })
    return rows
  }, [filteredSets, groupedBySeries])

  const activeRows = selectedTab === 'cards' ? cardVirtualRows : setVirtualRows

  const getVirtualRowKey = useMemo(() => {
    return (index: number) => {
      const row = activeRows[index]
      if (!row) return `${selectedTab}-row-${index}`

      switch (row.type) {
        case 'group-header':
          return `group-header:${row.label}`
        case 'series-header':
          return `series-header:${row.label}`
        case 'search-count':
          return 'search-count'
        case 'set-item':
          return `set-item:${row.set.id}`
        case 'card-row':
          return `card-row:${row.cards
            .map(card => card.id ?? `${card.name}-${card.number ?? ''}-${card.supertype ?? ''}`)
            .join('|')}`
      }
    }
  }, [activeRows, selectedTab])

  const rowVirtualizer = useVirtualizer({
    count: activeRows.length,
    getItemKey: getVirtualRowKey,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = activeRows[index]
      if (!row) return 50
      switch (row.type) {
        case 'group-header':
        case 'series-header':
          return HEADER_HEIGHT
        case 'search-count':
          return SEARCH_COUNT_HEIGHT
        case 'card-row':
          return cols === 3 ? CARD_ROW_HEIGHT_3_COLS : CARD_ROW_HEIGHT_2_COLS
        case 'set-item':
          return SET_ITEM_HEIGHT
      }
    },
    paddingStart: VIRTUAL_PADDING_START,
    paddingEnd: VIRTUAL_PADDING_END,
    measureElement: el => el.getBoundingClientRect().height,
    overscan: 3,
  })

  // Force virtualizer re-measurement when the sheet opens with data already loaded,
  // or when cards finish loading. The Sheet's entry animation can cause the virtualizer
  // to initialise with a stale container size, showing no items until a tab switch.
  useEffect(() => {
    if (!open || activeRows.length === 0) return
    const id = requestAnimationFrame(() => rowVirtualizer.measure())
    return () => cancelAnimationFrame(id)
  }, [open, activeRows.length, rowVirtualizer])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col h-full">
        {selectedCard ? (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setSelectedCard(null)}
                  aria-label="Back to browser"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="min-w-0">
                  <SheetTitle className="font-display">{selectedCard.name}</SheetTitle>
                  <SheetDescription>{selectedCard.set?.name || 'Unknown Set'}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 pb-20 space-y-6">
                <div className="bg-muted rounded-lg overflow-hidden">
                  {selectedCard.images?.large ? (
                    <img
                      src={selectedCard.images.large}
                      alt={selectedCard.name}
                      className="w-full"
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] flex items-center justify-center text-muted-foreground">
                      No Image Available
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{selectedCard.supertype}</span>
                      </div>
                      {selectedCard.types && selectedCard.types.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Types</span>
                          <div className="flex gap-1">
                            {selectedCard.types.map(type => (
                              <Badge key={type} variant="secondary">{type}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedCard.hp && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">HP</span>
                          <span className="font-medium">{selectedCard.hp}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Number</span>
                        <span className="font-medium">{selectedCard.number}/{selectedCard.set?.total || '?'}</span>
                      </div>
                      {selectedCard.rarity && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Rarity</span>
                          <span className="font-medium">{selectedCard.rarity}</span>
                        </div>
                      )}
                      {selectedCard.artist && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Artist</span>
                          <span className="font-medium">{selectedCard.artist}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedCard.attacks && selectedCard.attacks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Attacks</h4>
                      <div className="space-y-3">
                        {selectedCard.attacks.map((attack, idx) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-semibold">{attack.name}</span>
                              <span className="font-bold">{attack.damage}</span>
                            </div>
                            {attack.text && (
                              <p className="text-xs text-muted-foreground">{attack.text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCard.abilities && selectedCard.abilities.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Abilities</h4>
                      <div className="space-y-3">
                        {selectedCard.abilities.map((ability, idx) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg">
                            <div className="font-semibold mb-1">{ability.name}</div>
                            <p className="text-xs text-muted-foreground">{ability.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <SheetTitle className="font-display text-2xl flex items-center gap-2">
                <Package className="w-6 h-6" weight="duotone" />
                Browse Database
              </SheetTitle>
              <SheetDescription>
                Explore all cards and sets from the local TCG database
              </SheetDescription>
            </SheetHeader>

            {!isLoaded ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center space-y-4">
                  <Warning className="w-16 h-16 mx-auto text-yellow-600" weight="duotone" />
                  <div>
                    <p className="font-semibold text-lg mb-2">Database not loaded</p>
                    <p className="text-sm text-muted-foreground">
                      Please download the database first to browse cards and sets
                    </p>
                  </div>
                </div>
              </div>
            ) : (
            <>
              <div className="px-6 py-4 space-y-4 border-b shrink-0">
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, set, type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <Tabs value={selectedTab} onValueChange={(v) => {
                  setSelectedTab(v as 'cards' | 'sets')
                  setSelectedSupertypes([])
                }}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cards" className="font-display font-semibold">
                      <SquaresFour className="w-4 h-4 mr-1.5" />
                      Cards
                      <Badge variant="secondary" className="ml-2">
                        {(cards?.length || 0).toLocaleString()}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="sets" className="font-display font-semibold">
                      <Package className="w-4 h-4 mr-1.5" />
                      Sets
                      <Badge variant="secondary" className="ml-2">
                        {sets?.length || 0}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {selectedTab === 'cards' && (
                  <div className="flex gap-2 flex-wrap">
                    {QUICK_FILTER_SUPERTYPES.map(supertype => (
                      <Button
                        key={supertype}
                        variant={selectedSupertypes.includes(supertype) ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-3 text-xs rounded-full"
                        aria-pressed={selectedSupertypes.includes(supertype)}
                        onClick={() => setSelectedSupertypes(prev =>
                          prev.includes(supertype) ? prev.filter(t => t !== supertype) : [...prev, supertype]
                        )}
                      >
                        {supertype}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div ref={parentRef} className="flex-1 overflow-y-auto">
                {/* Empty / loading states */}
                {isLoadingCards && selectedTab === 'cards' && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading cards...</p>
                  </div>
                )}
                {!isLoadingCards && activeRows.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">
                      {selectedTab === 'cards' ? 'No cards found' : 'No sets found'}
                    </p>
                  </div>
                )}

                {/* Virtual scroll container */}
                {activeRows.length > 0 && (
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map(virtualItem => {
                      const row = activeRows[virtualItem.index]
                      const isFirst = virtualItem.index === 0
                      return (
                        <div
                          key={virtualItem.key}
                          data-index={virtualItem.index}
                          ref={rowVirtualizer.measureElement}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                          className="px-6"
                        >
                          {row.type === 'search-count' && (
                            <p className="text-sm text-muted-foreground pb-3">
                              {row.count.toLocaleString()} {row.count === 1 ? 'card' : 'cards'} found
                            </p>
                          )}

                          {(row.type === 'group-header' || row.type === 'series-header') && (
                            <div className={isFirst ? 'pb-0' : 'pt-6 pb-0'}>
                              <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
                                {row.label}
                                <Badge variant="outline">{row.count}</Badge>
                              </h3>
                            </div>
                          )}

                          {row.type === 'card-row' && (
                            <div className={`grid gap-3 pb-3 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                              {row.cards.map(card => (
                                <button
                                  key={card.id}
                                  onClick={() => setSelectedCard(card)}
                                  className="group relative bg-card rounded-lg overflow-hidden border hover:border-primary transition-all hover:shadow-lg"
                                >
                                  <div className="aspect-[2/3] bg-muted">
                                    {card.images?.small ? (
                                      <img
                                        src={card.images.small}
                                        alt={card.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                                        No Image
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-2">
                                    <p className="text-xs font-semibold truncate">{card.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{card.set?.name || 'Unknown Set'}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {row.type === 'set-item' && (
                            <div className="pb-2">
                              <Card className="hover:border-primary transition-colors">
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
                                      <img
                                        src={row.set.images.symbol}
                                        alt={row.set.name}
                                        className="w-8 h-8 object-contain"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold truncate">{row.set.name}</h4>
                                      <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <Badge variant="secondary" className="text-xs">
                                          {row.set.total} cards
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {new Date(row.set.releaseDate).toLocaleDateString()}
                                        </span>
                                        {row.set.ptcgoCode && (
                                          <Badge variant="outline" className="text-xs">
                                            {row.set.ptcgoCode}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

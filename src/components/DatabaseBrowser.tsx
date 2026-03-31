import { useState, useMemo, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { MagnifyingGlass, X, Package, SquaresFour, Warning } from '@phosphor-icons/react'
import { useTCGDatabase } from '@/lib/tcg-database'
import type { TCGCard, TCGSet } from '@/lib/tcg-database'

interface DatabaseBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DatabaseBrowser({ open, onOpenChange }: DatabaseBrowserProps) {
  const { getAllCards, sets, isLoaded, metadata } = useTCGDatabase()
  const [cards, setCards] = useState<TCGCard[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState<'cards' | 'sets'>('cards')
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null)
  const [isLoadingCards, setIsLoadingCards] = useState(false)

  useEffect(() => {
    const loadCards = async () => {
      if (open && isLoaded && cards.length === 0) {
        setIsLoadingCards(true)
        try {
          const allCards = await getAllCards()
          setCards(allCards)
          console.log('[DatabaseBrowser] Loaded cards:', allCards.length)
        } catch (error) {
          console.error('[DatabaseBrowser] Failed to load cards:', error)
        } finally {
          setIsLoadingCards(false)
        }
      }
    }
    loadCards()
  }, [open, isLoaded, cards.length, getAllCards])
  
  useEffect(() => {
    console.log('[DatabaseBrowser] State:', { 
      open, 
      isLoaded, 
      cardsLength: cards.length, 
      setsLength: sets.length,
      metadata 
    })
  }, [open, isLoaded, cards.length, sets.length, metadata])

  const filteredCards = useMemo(() => {
    if (!cards || cards.length === 0) return []
    
    const query = searchQuery.toLowerCase()
    if (!query) return cards.slice(0, 100)
    
    return cards.filter(card =>
      card.name.toLowerCase().includes(query) ||
      card.set.name.toLowerCase().includes(query) ||
      card.number.includes(searchQuery) ||
      card.types?.some(type => type.toLowerCase().includes(query))
    ).slice(0, 100)
  }, [cards, searchQuery])

  const filteredSets = useMemo(() => {
    if (!sets || sets.length === 0) return []
    
    const query = searchQuery.toLowerCase()
    if (!query) return sets
    
    return sets.filter(set =>
      set.name.toLowerCase().includes(query) ||
      set.series.toLowerCase().includes(query) ||
      set.id.toLowerCase().includes(query)
    )
  }, [sets, searchQuery])

  const groupedByType = useMemo(() => {
    const groups: Record<string, TCGCard[]> = {}
    filteredCards.forEach(card => {
      const type = card.supertype || 'Other'
      if (!groups[type]) groups[type] = []
      groups[type].push(card)
    })
    return groups
  }, [filteredCards])

  const groupedBySeries = useMemo(() => {
    const groups: Record<string, TCGSet[]> = {}
    filteredSets.forEach(set => {
      const series = set.series || 'Other'
      if (!groups[series]) groups[series] = []
      groups[series].push(set)
    })
    return groups
  }, [filteredSets])

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="font-display text-2xl flex items-center gap-2">
              <Package className="w-6 h-6" weight="duotone" />
              Browse Database
            </SheetTitle>
            <SheetDescription>
              Explore all cards and sets from the local TCG database
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden">
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
                <div className="px-6 py-4 space-y-4 border-b">
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

                  <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'cards' | 'sets')}>
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
                </div>

                <ScrollArea className="flex-1">
                  <div className="px-6 py-4">
                    {selectedTab === 'cards' && (
                      <div className="space-y-6">
                        {filteredCards.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground">No cards found</p>
                          </div>
                        ) : (
                          <>
                            {searchQuery ? (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {filteredCards.map((card) => (
                                  <button
                                    key={card.id}
                                    onClick={() => setSelectedCard(card)}
                                    className="group relative bg-card rounded-lg overflow-hidden border hover:border-primary transition-all hover:shadow-lg"
                                  >
                                    <div className="aspect-[2/3] bg-muted">
                                      <img
                                        src={card.images.small}
                                        alt={card.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="p-2">
                                      <p className="text-xs font-semibold truncate">{card.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{card.set.name}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              Object.entries(groupedByType).map(([type, typeCards]) => (
                                <div key={type}>
                                  <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
                                    {type}
                                    <Badge variant="outline">{typeCards.length}</Badge>
                                  </h3>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {typeCards.slice(0, 12).map((card) => (
                                      <button
                                        key={card.id}
                                        onClick={() => setSelectedCard(card)}
                                        className="group relative bg-card rounded-lg overflow-hidden border hover:border-primary transition-all hover:shadow-lg"
                                      >
                                        <div className="aspect-[2/3] bg-muted">
                                          <img
                                            src={card.images.small}
                                            alt={card.name}
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                        <div className="p-2">
                                          <p className="text-xs font-semibold truncate">{card.name}</p>
                                          <p className="text-xs text-muted-foreground truncate">{card.set.name}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                            {!searchQuery && (
                              <p className="text-xs text-muted-foreground text-center pt-2">
                                Showing first 100 cards. Use search to find specific cards.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {selectedTab === 'sets' && (
                      <div className="space-y-6">
                        {filteredSets.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground">No sets found</p>
                          </div>
                        ) : (
                          Object.entries(groupedBySeries).map(([series, seriesSets]) => (
                            <div key={series}>
                              <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
                                {series}
                                <Badge variant="outline">{seriesSets.length}</Badge>
                              </h3>
                              <div className="space-y-2">
                                {seriesSets.map((set) => (
                                  <Card key={set.id} className="hover:border-primary transition-colors">
                                    <CardContent className="p-4">
                                      <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
                                          <img
                                            src={set.images.symbol}
                                            alt={set.name}
                                            className="w-8 h-8 object-contain"
                                          />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <h4 className="font-semibold truncate">{set.name}</h4>
                                          <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <Badge variant="secondary" className="text-xs">
                                              {set.total} cards
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                              {new Date(set.releaseDate).toLocaleDateString()}
                                            </span>
                                            {set.ptcgoCode && (
                                              <Badge variant="outline" className="text-xs">
                                                {set.ptcgoCode}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {selectedCard && (
        <Sheet open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader className="mb-4">
              <SheetTitle className="font-display">{selectedCard.name}</SheetTitle>
              <SheetDescription>{selectedCard.set.name}</SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-120px)]">
              <div className="space-y-6 pb-6">
                <div className="bg-muted rounded-lg overflow-hidden">
                  <img
                    src={selectedCard.images.large}
                    alt={selectedCard.name}
                    className="w-full"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{selectedCard.supertype}</span>
                      </div>
                      {selectedCard.types && (
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
                        <span className="font-medium">{selectedCard.number}/{selectedCard.set.total}</span>
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
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

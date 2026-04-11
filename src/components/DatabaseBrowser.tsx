import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Package, SquaresFour, Warning, ArrowLeft, Plus, FolderPlus, DotsThreeVertical, Eye, CaretDown, CaretRight } from '@phosphor-icons/react'
import { CatalogSearchBar } from '@/components/shared/CatalogSearchBar'
import { CatalogFilterControls } from '@/components/shared/CatalogFilterControls'
import { CardDetailPresentation } from '@/components/shared/CardDetailPresentation'
import { useTCGDatabase } from '@/lib/tcg-database'
import { logger } from '@/lib/logger'
import { getFriendlySetName } from '@/lib/set-display'
import type { TCGCard, TCGSet } from '@/lib/tcg-database'

interface DatabaseBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddCard?: (card: TCGCard) => void
  onAddToCollection?: (card: TCGCard) => void
}

const HEADER_HEIGHT_FIRST = 40      // pb-3 (12) + text-lg line (~28)
const HEADER_HEIGHT_WITH_TOP_PADDING = 64  // pt-6 (24) + text-lg (~28) + pb-3 (12)
const SEARCH_COUNT_HEIGHT = 32
const SET_ITEM_HEIGHT = 88
const VIRTUAL_PADDING_START = 16
const VIRTUAL_PADDING_END = 80
const MOBILE_BREAKPOINT = 640
const QUICK_FILTER_SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'] as const
type QuickFilterSupertype = typeof QUICK_FILTER_SUPERTYPES[number]
type CardGroupBy = 'none' | 'supertype' | 'type' | 'rarity'
type CardSortBy = 'national-dex' | 'name-asc' | 'name-desc' | 'set-number'

type VirtualRow =
  | { type: 'group-header'; label: string; count: number; withTopPadding: boolean; collapsed: boolean }
  | { type: 'card-row'; cards: TCGCard[] }
  | { type: 'search-count'; count: number }
  | { type: 'series-header'; label: string; count: number; withTopPadding: boolean }
  | { type: 'set-item'; set: TCGSet }

function getSetDisplayName(set: Pick<TCGSet, 'name' | 'series'>): string {
  return getFriendlySetName(set.name, set.series)
}

function getPrimaryPokedexNumber(card: TCGCard): number {
  const n = card.nationalPokedexNumbers?.[0]
  return typeof n === 'number' && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function getCardNumberSortValue(cardNumber?: string): number {
  if (!cardNumber) return Number.POSITIVE_INFINITY
  const match = cardNumber.match(/\d+/)
  if (!match) return Number.POSITIVE_INFINITY
  return Number(match[0])
}

export function DatabaseBrowser({ open, onOpenChange, onAddCard, onAddToCollection }: DatabaseBrowserProps) {
  const { getAllCards, sets, isLoaded, metadata } = useTCGDatabase()
  const [cards, setCards] = useState<TCGCard[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState<'cards' | 'sets'>('cards')
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null)
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [cols, setCols] = useState(3)
  const [selectedSupertypes, setSelectedSupertypes] = useState<QuickFilterSupertype[]>([])
  const [selectedSetFilters, setSelectedSetFilters] = useState<Array<{ id: string; name: string }>>([])
  const [cardSortBy, setCardSortBy] = useState<CardSortBy>('national-dex')
  const [cardGroupBy, setCardGroupBy] = useState<CardGroupBy>('none')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const parentRef = useRef<HTMLDivElement>(null)

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

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
          logger.info('DatabaseBrowser', 'Loading cards from database...')
          const allCards = await getAllCards()
          logger.info('DatabaseBrowser', 'Loaded cards:', allCards.length)
          setCards(allCards)
        } catch (error) {
          logger.error('DatabaseBrowser', 'Failed to load cards:', error)
        } finally {
          setIsLoadingCards(false)
        }
      }
    }
    loadCards()
  }, [open, isLoaded, getAllCards])
  
  useEffect(() => {
    logger.debug('DatabaseBrowser', 'State:', {
      open, 
      isLoaded, 
      cardsLength: cards.length, 
      setsLength: sets.length,
      metadata 
    })
  }, [open, isLoaded, cards.length, sets.length, metadata])

  // Reset scroll and collapsed state when tab, search, quick filters, or groupBy changes
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0
    }
    setCollapsedGroups(new Set())
  }, [selectedTab, searchQuery, selectedSupertypes, selectedSetFilters, cardGroupBy])

  const filteredCards = useMemo(() => {
    if (!cards || cards.length === 0) return []
    
    let result = cards
    const selectedSupertypeValues: readonly string[] = selectedSupertypes

    if (selectedSupertypes.length > 0) {
      result = result.filter(
        card => !!card.supertype && selectedSupertypeValues.includes(card.supertype)
      )
    }

    if (selectedSetFilters.length > 0) {
      const selectedSetIds = new Set(selectedSetFilters.map(filter => filter.id))
      result = result.filter(card => card.set?.id && selectedSetIds.has(card.set.id))
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
  }, [cards, searchQuery, selectedSupertypes, selectedSetFilters])

  const sortedFilteredCards = useMemo(() => {
    const sorted = [...filteredCards]
    sorted.sort((a, b) => {
      if (cardSortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '') || (a.set?.name || '').localeCompare(b.set?.name || '')
      }
      if (cardSortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '') || (b.set?.name || '').localeCompare(a.set?.name || '')
      }
      if (cardSortBy === 'set-number') {
        const setDiff = (a.set?.name || '').localeCompare(b.set?.name || '')
        if (setDiff !== 0) return setDiff
        return getCardNumberSortValue(a.number) - getCardNumberSortValue(b.number)
      }

      const pokedexDiff = getPrimaryPokedexNumber(a) - getPrimaryPokedexNumber(b)
      if (pokedexDiff !== 0) return pokedexDiff

      const nameDiff = (a.name || '').localeCompare(b.name || '')
      if (nameDiff !== 0) return nameDiff

      const setDiff = (a.set?.name || '').localeCompare(b.set?.name || '')
      if (setDiff !== 0) return setDiff

      return getCardNumberSortValue(a.number) - getCardNumberSortValue(b.number)
    })
    return sorted
  }, [filteredCards, cardSortBy])

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

  const groupedCards = useMemo(() => {
    if (cardGroupBy === 'none') return [] as Array<{ label: string; cards: TCGCard[] }>

    const groups: Record<string, TCGCard[]> = {}
    sortedFilteredCards.forEach(card => {
      if (!card) return
      const label = cardGroupBy === 'supertype'
        ? (card.supertype || 'Other')
        : cardGroupBy === 'type'
          ? (card.types?.[0] || 'Other')
          : (card.rarity || 'Other')
      if (!groups[label]) groups[label] = []
      groups[label].push(card)
    })

    return Object.entries(groups)
      .map(([label, cards]) => ({ label, cards }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [sortedFilteredCards, cardGroupBy])

  const activeFiltersCount = selectedSupertypes.length + selectedSetFilters.length
  const supertypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    cards.forEach(card => {
      if (!card.supertype) return
      counts.set(card.supertype, (counts.get(card.supertype) || 0) + 1)
    })
    return counts
  }, [cards])
  const setCounts = useMemo(() => {
    const counts = new Map<string, number>()
    cards.forEach(card => {
      const id = card.set?.id
      if (!id) return
      counts.set(id, (counts.get(id) || 0) + 1)
    })
    return counts
  }, [cards])

  const toggleSupertype = useCallback((supertype: QuickFilterSupertype) => {
    setSelectedSupertypes(prev =>
      prev.includes(supertype) ? prev.filter(t => t !== supertype) : [...prev, supertype]
    )
  }, [])

  const toggleSetFilter = useCallback((set: TCGSet) => {
    setSelectedSetFilters(prev => {
      if (prev.some(filter => filter.id === set.id)) {
        return prev.filter(filter => filter.id !== set.id)
      }
      return [...prev, { id: set.id, name: getSetDisplayName(set) }]
    })
  }, [])

  const clearCardFilters = useCallback(() => {
    setSelectedSupertypes([])
    setSelectedSetFilters([])
  }, [])

  const cardFilterSections = useMemo(() => ([
    {
      id: 'category',
      label: 'Card Category',
      options: QUICK_FILTER_SUPERTYPES.map(supertype => ({
        id: `supertype:${supertype}`,
        label: supertype,
        checked: selectedSupertypes.includes(supertype),
        count: supertypeCounts.get(supertype) || 0,
        onToggle: () => toggleSupertype(supertype),
      })),
    },
    {
      id: 'sets',
      label: 'Sets',
      emptyMessage: 'No sets available',
      options: sets.map(set => ({
        id: `set:${set.id}`,
        label: getSetDisplayName(set),
        checked: selectedSetFilters.some(filter => filter.id === set.id),
        count: setCounts.get(set.id) || 0,
        onToggle: () => toggleSetFilter(set),
      })),
    },
  ]), [selectedSupertypes, supertypeCounts, sets, selectedSetFilters, setCounts, toggleSetFilter, toggleSupertype])

  const cardActiveFilterChips = useMemo(() => ([
    ...selectedSupertypes.map(supertype => ({
      id: `chip-supertype:${supertype}`,
      label: supertype,
      onRemove: () => toggleSupertype(supertype),
    })),
    ...selectedSetFilters.map(set => ({
      id: `chip-set:${set.id}`,
      label: getSetDisplayName(set),
      onRemove: () => setSelectedSetFilters(prev => prev.filter(filter => filter.id !== set.id)),
    })),
  ]), [selectedSupertypes, selectedSetFilters, toggleSupertype])

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
    if (sortedFilteredCards.length === 0) return []
    const rows: VirtualRow[] = []
    if (searchQuery) {
      rows.push({ type: 'search-count', count: sortedFilteredCards.length })
    }

    if (cardGroupBy === 'none') {
      for (let i = 0; i < sortedFilteredCards.length; i += cols) {
        rows.push({ type: 'card-row', cards: sortedFilteredCards.slice(i, i + cols) })
      }
    } else {
      groupedCards.forEach((group, index) => {
        const collapsed = collapsedGroups.has(group.label)
        rows.push({ type: 'group-header', label: group.label, count: group.cards.length, withTopPadding: index !== 0, collapsed })
        if (!collapsed) {
          for (let i = 0; i < group.cards.length; i += cols) {
            rows.push({ type: 'card-row', cards: group.cards.slice(i, i + cols) })
          }
        }
      })
    }
    return rows
  }, [sortedFilteredCards, groupedCards, searchQuery, cols, cardGroupBy, collapsedGroups])

  const setVirtualRows = useMemo((): VirtualRow[] => {
    if (filteredSets.length === 0) return []
    const rows: VirtualRow[] = []
    Object.entries(groupedBySeries).forEach(([series, seriesSets], index) => {
      rows.push({ type: 'series-header', label: series, count: seriesSets.length, withTopPadding: index !== 0 })
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
    measureElement: (element) => element.getBoundingClientRect().height,
    estimateSize: (index) => {
      const row = activeRows[index]
      if (!row) return 50
      switch (row.type) {
        case 'group-header':
        case 'series-header':
          return row.withTopPadding ? HEADER_HEIGHT_WITH_TOP_PADDING : HEADER_HEIGHT_FIRST
        case 'search-count':
          return SEARCH_COUNT_HEIGHT
        case 'card-row': {
          const containerWidth = parentRef.current?.clientWidth ?? (cols === 3 ? 600 : 360)
          const colGaps = (cols - 1) * 12 // gap-3 = 12px between columns
          const sidePadding = 48          // px-6 on both sides of the virtual-item div
          const cardWidth = (containerWidth - sidePadding - colGaps) / cols
          const imageHeight = cardWidth * 1.5 // aspect-[2/3]
          const cardInfoHeight = 52           // p-2 padding + 2 text lines
          return Math.ceil(imageHeight + cardInfoHeight + 12) // +12 for pb-3
        }
        case 'set-item':
          return SET_ITEM_HEIGHT
      }
    },
    paddingStart: VIRTUAL_PADDING_START,
    paddingEnd: VIRTUAL_PADDING_END,
    overscan: 3,
  })

  // Force virtualizer re-measurement when the sheet opens with data already loaded,
  // or when cards finish loading. The Sheet's entry animation can cause the virtualizer
  // to initialise with a stale container size, showing no items until a tab switch.
  useEffect(() => {
    if (!open || activeRows.length === 0) return
    const id = requestAnimationFrame(() => rowVirtualizer.measure())
    return () => cancelAnimationFrame(id)
  }, [open, activeRows, cols, selectedTab, cardGroupBy, rowVirtualizer])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex h-full min-h-0 flex-col">
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
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display">{selectedCard.name}</SheetTitle>
                  <SheetDescription>{getSetDisplayName(selectedCard.set || { name: 'Unknown Set', series: '' })}</SheetDescription>
                </div>
                {onAddCard && (
                  <Button
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => onAddCard(selectedCard)}
                  >
                    <Plus className="w-4 h-4" weight="bold" />
                    Add to Catalog
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="relative flex-1 min-h-0">
              <div className="absolute inset-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
                <CardDetailPresentation
                  image={(
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
                  )}
                >
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{selectedCard.supertype}</span>
                      </div>
                      {typeof selectedCard.nationalPokedexNumbers?.[0] === 'number' && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">National Dex</span>
                          <span className="font-medium">#{selectedCard.nationalPokedexNumbers[0]}</span>
                        </div>
                      )}
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
                </CardDetailPresentation>
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
                <CatalogSearchBar
                  placeholder="Search by name, set, type..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />

                <Tabs value={selectedTab} onValueChange={(v) => {
                  setSelectedTab(v as 'cards' | 'sets')
                }}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cards" className="font-display font-semibold">
                      <SquaresFour className="w-4 h-4 mr-1.5" />
                      Cards
                      <Badge variant="secondary" className="ml-2">
                        {(metadata?.cardCount ?? cards?.length ?? 0).toLocaleString()}
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
                  <CatalogFilterControls
                    compact
                    sortValue={cardSortBy}
                    onSortChange={(value) => setCardSortBy(value as CardSortBy)}
                    sortOptions={[
                      { value: 'national-dex', label: 'National Dex' },
                      { value: 'name-asc', label: 'Name A-Z' },
                      { value: 'name-desc', label: 'Name Z-A' },
                      { value: 'set-number', label: 'Set + Number' },
                    ]}
                    groupByValue={cardGroupBy}
                    onGroupByChange={(value) => setCardGroupBy(value as CardGroupBy)}
                    groupOptions={[
                      { value: 'none', label: 'None' },
                      { value: 'supertype', label: 'Supertype' },
                      { value: 'type', label: 'Type' },
                      { value: 'rarity', label: 'Rarity' },
                    ]}
                    activeFiltersCount={activeFiltersCount}
                    onClearFilters={clearCardFilters}
                    filterSections={cardFilterSections}
                    activeFilterChips={cardActiveFilterChips}
                  />
                )}
              </div>

              <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                      return (
                        <div
                          key={virtualItem.key}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualItem.index}
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

                          {row.type === 'group-header' && (
                            <div className={row.withTopPadding ? 'pt-6 pb-3' : 'pb-3'}>
                              <button
                                type="button"
                                className="flex items-center gap-2 w-full text-left group/header"
                                onClick={() => toggleGroup(row.label)}
                              >
                                {row.collapsed
                                  ? <CaretRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover/header:text-foreground transition-colors" />
                                  : <CaretDown className="w-4 h-4 shrink-0 text-muted-foreground group-hover/header:text-foreground transition-colors" />}
                                <h3 className="font-display font-semibold text-lg">{row.label}</h3>
                                <Badge variant="outline">{row.count}</Badge>
                              </button>
                            </div>
                          )}

                          {row.type === 'series-header' && (
                            <div className={row.withTopPadding ? 'pt-6 pb-3' : 'pb-3'}>
                              <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                                {row.label}
                                <Badge variant="outline">{row.count}</Badge>
                              </h3>
                            </div>
                          )}

                          {row.type === 'card-row' && (
                            <div className={`grid gap-3 pb-3 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                              {row.cards.map(card => (
                                <div
                                  key={card.id}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`View details for ${card.name}`}
                                  className="group relative bg-card rounded-lg overflow-hidden border hover:border-primary transition-all hover:shadow-lg cursor-pointer"
                                  onClick={() => setSelectedCard(card)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      setSelectedCard(card)
                                    }
                                  }}
                                >
                                  <div className="aspect-[2/3] bg-muted relative">
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
                                    {(onAddCard || onAddToCollection) && (
                                      <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="bg-background/95 backdrop-blur-sm hover:bg-background rounded-full p-1.5 shadow-lg opacity-40 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95">
                                              <DotsThreeVertical className="w-4 h-4" weight="bold" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="start" className="w-48">
                                            <DropdownMenuItem onClick={() => setSelectedCard(card)}>
                                              <Eye className="w-4 h-4 mr-2" />
                                              View Details
                                            </DropdownMenuItem>
                                            {(onAddCard || onAddToCollection) && <DropdownMenuSeparator />}
                                            {onAddCard && (
                                              <DropdownMenuItem onClick={() => onAddCard(card)}>
                                                <Plus className="w-4 h-4 mr-2" />
                                                Add to Catalog
                                              </DropdownMenuItem>
                                            )}
                                            {onAddToCollection && (
                                              <DropdownMenuItem onClick={() => onAddToCollection(card)}>
                                                <FolderPlus className="w-4 h-4 mr-2" />
                                                Add to Collection
                                              </DropdownMenuItem>
                                            )}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-2">
                                    <p className="text-xs font-semibold truncate">{card.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{card.set ? getSetDisplayName(card.set) : 'Unknown Set'}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {row.type === 'set-item' && (
                            <div className="pb-2">
                              <Card
                                className="hover:border-primary transition-colors cursor-pointer"
                                onClick={() => {
                                  setSelectedSetFilters(prev => {
                                    if (prev.some(filter => filter.id === row.set.id)) {
                                      return prev
                                    }
                                    return [...prev, { id: row.set.id, name: getSetDisplayName(row.set) }]
                                  })
                                  setSelectedTab('cards')
                                  setSearchQuery('')
                                }}
                              >
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
                                      <h4 className="font-semibold truncate">{getSetDisplayName(row.set)}</h4>
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

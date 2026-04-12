import { useState, useMemo, useEffect, useCallback } from 'react'
import type { PokemonCard, CardCollection, ViewMode } from '@/lib/types'
import type { CatalogGroupBy, CatalogSortBy } from '@/lib/catalog-types'
import type { CatalogFilterSection, CatalogActiveFilterChip } from '@/components/shared/CatalogFilterControls'

function parseCardNumberSortValue(cardNumber: string | undefined): number {
  if (!cardNumber) return Number.POSITIVE_INFINITY
  const match = cardNumber.match(/\d+/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

function getNationalDexSortValue(card: Pick<PokemonCard, 'pokedexNumber'>): number {
  if (typeof card.pokedexNumber !== 'number' || Number.isNaN(card.pokedexNumber) || card.pokedexNumber <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return card.pokedexNumber
}

interface UseCatalogFiltersInput {
  cards: PokemonCard[]
  viewMode: ViewMode
  selectedCollection: CardCollection | null
}

export function useCatalogFilters({ cards, viewMode, selectedCollection }: UseCatalogFiltersInput) {
  const [searchQuery,             setSearchQuery]             = useState('')
  const [selectedTypes,           setSelectedTypes]           = useState<string[]>([])
  const [selectedRarities,        setSelectedRarities]        = useState<string[]>([])
  const [selectedSupertypes,      setSelectedSupertypes]      = useState<string[]>([])
  const [catalogSortBy,           setCatalogSortBy]           = useState<CatalogSortBy>('national-dex')
  const [catalogGroupBy,          setCatalogGroupBy]          = useState<CatalogGroupBy>('none')
  const [collapsedCatalogGroups,  setCollapsedCatalogGroups]  = useState<Set<string>>(new Set())

  // Reset collapsed groups when grouping changes
  useEffect(() => { setCollapsedCatalogGroups(new Set()) }, [catalogGroupBy])

  const { availableTypes, availableSupertypes, availableRarities, typeCounts, supertypeCounts, rarityCounts } = useMemo(() => {
    const typeSet = new Set<string>()
    const supertypeSet = new Set<string>()
    const raritySet = new Set<string>()
    const tCounts  = new Map<string, number>()
    const stCounts = new Map<string, number>()
    const rCounts  = new Map<string, number>()
    for (const card of cards) {
      if (card.type)      { typeSet.add(card.type);           tCounts.set(card.type,       (tCounts.get(card.type)       || 0) + 1) }
      if (card.supertype) { supertypeSet.add(card.supertype); stCounts.set(card.supertype, (stCounts.get(card.supertype) || 0) + 1) }
      if (card.rarity)    { raritySet.add(card.rarity);       rCounts.set(card.rarity,     (rCounts.get(card.rarity)     || 0) + 1) }
    }
    return {
      availableTypes:      Array.from(typeSet).sort(),
      availableSupertypes: Array.from(supertypeSet).sort(),
      availableRarities:   Array.from(raritySet).sort(),
      typeCounts:  tCounts,
      supertypeCounts: stCounts,
      rarityCounts: rCounts,
    }
  }, [cards])

  const filteredCards = useMemo(() => {
    let result = cards
    if (viewMode === 'collection' && selectedCollection) result = result.filter(c => selectedCollection.cardIds.includes(c.id))
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.set.toLowerCase().includes(query)  ||
        c.type.toLowerCase().includes(query) ||
        c.rarity.toLowerCase().includes(query)
      )
    }
    if (selectedSupertypes.length) result = result.filter(c => c.supertype && selectedSupertypes.includes(c.supertype))
    if (selectedTypes.length)      result = result.filter(c => selectedTypes.includes(c.type))
    if (selectedRarities.length)   result = result.filter(c => selectedRarities.includes(c.rarity))
    if (viewMode === 'duplicates')  result = result.filter(c => c.quantity > 1)

    if (catalogSortBy === 'name-asc') {
      return [...result].sort((a, b) => a.name.localeCompare(b.name) || a.set.localeCompare(b.set) || b.dateAdded - a.dateAdded)
    }
    if (catalogSortBy === 'name-desc') {
      return [...result].sort((a, b) => b.name.localeCompare(a.name) || b.set.localeCompare(a.set) || b.dateAdded - a.dateAdded)
    }
    if (catalogSortBy === 'recent') {
      return [...result].sort((a, b) => b.dateAdded - a.dateAdded)
    }
    return [...result].sort((a, b) => {
      const dexDiff = getNationalDexSortValue(a) - getNationalDexSortValue(b)
      if (dexDiff !== 0) return dexDiff
      const numberDiff = parseCardNumberSortValue(a.cardNumber) - parseCardNumberSortValue(b.cardNumber)
      if (numberDiff !== 0) return numberDiff
      const nameDiff = a.name.localeCompare(b.name)
      if (nameDiff !== 0) return nameDiff
      const setDiff = a.set.localeCompare(b.set)
      if (setDiff !== 0) return setDiff
      return b.dateAdded - a.dateAdded
    })
  }, [cards, searchQuery, viewMode, selectedTypes, selectedRarities, selectedSupertypes, selectedCollection, catalogSortBy])

  const groupedCatalogCards = useMemo(() => {
    if (catalogGroupBy === 'none') return [] as Array<{ label: string; cards: PokemonCard[] }>
    const groups: Record<string, PokemonCard[]> = {}
    for (const card of filteredCards) {
      let label = 'Unknown'
      if (catalogGroupBy === 'supertype') label = card.supertype || 'Other'
      if (catalogGroupBy === 'type')      label = card.type      || 'Other'
      if (catalogGroupBy === 'rarity')    label = card.rarity    || 'Other'
      if (!groups[label]) groups[label] = []
      groups[label].push(card)
    }
    return Object.entries(groups)
      .map(([label, groupCards]) => ({ label, cards: groupCards }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredCards, catalogGroupBy])

  const duplicateCount    = useMemo(() => cards.filter(c => c.quantity > 1).length, [cards])
  const totalCards        = useMemo(() => cards.reduce((s, c) => s + c.quantity, 0), [cards])
  const cardsWithDexCount = useMemo(
    () => cards.filter(c => typeof c.pokedexNumber === 'number' && c.pokedexNumber > 0).length,
    [cards],
  )
  const collectionValueUsd = useMemo(() => cards.reduce((s, c) => {
    const p = c.prices?.tcgplayer?.market ?? 0
    return s + p * c.quantity
  }, 0), [cards])
  const collectionValueEur = useMemo(() => cards.reduce((s, c) => {
    const p = c.prices?.cardmarket?.trendPrice ?? 0
    return s + p * c.quantity
  }, 0), [cards])

  const activeFiltersCount = selectedTypes.length + selectedRarities.length + selectedSupertypes.length

  const handleToggleSupertype = (v: string) => setSelectedSupertypes(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  const handleToggleType      = (v: string) => setSelectedTypes(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  const handleToggleRarity    = (v: string) => setSelectedRarities(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  const handleClearFilters    = ()          => { setSelectedTypes([]); setSelectedRarities([]); setSelectedSupertypes([]); setSearchQuery('') }

  const toggleCatalogGroup = useCallback((label: string) => {
    setCollapsedCatalogGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const catalogFilterSections = useMemo((): CatalogFilterSection[] => ([
    {
      id: 'category',
      label: 'Card Category',
      emptyMessage: 'No categories available',
      options: availableSupertypes.map(s => ({
        id: `supertype:${s}`, label: s, checked: selectedSupertypes.includes(s),
        count: supertypeCounts.get(s) || 0, onToggle: () => handleToggleSupertype(s),
      })),
    },
    {
      id: 'types',
      label: 'Card Types',
      emptyMessage: 'No types available',
      options: availableTypes.map(t => ({
        id: `type:${t}`, label: t, checked: selectedTypes.includes(t),
        count: typeCounts.get(t) || 0, onToggle: () => handleToggleType(t),
      })),
    },
    {
      id: 'rarities',
      label: 'Rarities',
      emptyMessage: 'No rarities available',
      options: availableRarities.map(r => ({
        id: `rarity:${r}`, label: r, checked: selectedRarities.includes(r),
        count: rarityCounts.get(r) || 0, onToggle: () => handleToggleRarity(r),
      })),
    },
  ]), [
    availableSupertypes, availableTypes, availableRarities,
    selectedSupertypes, selectedTypes, selectedRarities,
    supertypeCounts, typeCounts, rarityCounts,
  ])

  const catalogActiveFilterChips = useMemo((): CatalogActiveFilterChip[] => ([
    ...selectedSupertypes.map(s => ({ id: `chip-supertype:${s}`, label: `Category: ${s}`, onRemove: () => handleToggleSupertype(s) })),
    ...selectedTypes.map(t =>      ({ id: `chip-type:${t}`,      label: `Type: ${t}`,     onRemove: () => handleToggleType(t) })),
    ...selectedRarities.map(r =>   ({ id: `chip-rarity:${r}`,    label: `Rarity: ${r}`,   onRemove: () => handleToggleRarity(r) })),
  ]), [selectedSupertypes, selectedTypes, selectedRarities])

  return {
    searchQuery, setSearchQuery,
    selectedTypes, selectedRarities, selectedSupertypes,
    catalogSortBy, setCatalogSortBy,
    catalogGroupBy, setCatalogGroupBy,
    collapsedCatalogGroups,
    filteredCards,
    groupedCatalogCards,
    duplicateCount, totalCards, cardsWithDexCount, collectionValueUsd, collectionValueEur,
    activeFiltersCount,
    handleToggleSupertype, handleToggleType, handleToggleRarity, handleClearFilters,
    toggleCatalogGroup,
    catalogFilterSections,
    catalogActiveFilterChips,
  }
}

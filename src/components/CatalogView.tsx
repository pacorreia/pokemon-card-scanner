import { type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Database, CheckSquare, Copy, CaretDown, CaretRight } from '@phosphor-icons/react'
import { CardItem } from '@/components/CardItem'
import { EmptyState } from '@/components/EmptyState'
import { CatalogSearchBar } from '@/components/shared/CatalogSearchBar'
import { CatalogFilterControls } from '@/components/shared/CatalogFilterControls'
import type { CatalogFilterSection, CatalogActiveFilterChip } from '@/components/shared/CatalogFilterControls'
import type { PokemonCard, CardCollection, ViewMode } from '@/lib/types'
import type { CatalogSortBy, CatalogGroupBy, CatalogVirtualRow } from '@/lib/catalog-types'

// Minimal shape we actually use from the virtualizer
interface VirtualizerHandle {
  getTotalSize: () => number
  getVirtualItems: () => Array<{ key: React.Key; index: number; start: number }>
  measureElement: (el: Element | null) => void
}

interface CatalogViewProps {
  // data
  cards: PokemonCard[]
  filteredCards: PokemonCard[]
  dataLoading: boolean
  // stats
  totalCards: number
  collectionValueUsd: number
  collectionValueEur: number
  cardsWithDexCount: number
  duplicateCount: number
  // view mode
  viewMode: ViewMode
  selectedCollection: CardCollection | null
  onViewModeChange: (v: ViewMode) => void
  // search / sort / group / filters
  searchQuery: string
  onSearchChange: (v: string) => void
  catalogSortBy: CatalogSortBy
  onSortChange: (v: CatalogSortBy) => void
  catalogGroupBy: CatalogGroupBy
  onGroupByChange: (v: CatalogGroupBy) => void
  activeFiltersCount: number
  onClearFilters: () => void
  filterSections: CatalogFilterSection[]
  activeFilterChips: CatalogActiveFilterChip[]
  // virtual scroll
  catalogCols: number
  catalogParentRef: RefObject<HTMLDivElement>
  catalogVirtualRows: CatalogVirtualRow[]
  catalogRowVirtualizer: VirtualizerHandle
  // selection
  isSelectionMode: boolean
  selectedCardIds: Set<string>
  // callbacks
  onBack: () => void
  onCardClick: (card: PokemonCard) => void
  onUpdateQuantity: (id: string, delta: number) => void
  onDelete: (id: string) => void
  onAddToCollection: (card: PokemonCard) => void
  onRematch: (card: PokemonCard) => void
  onToggleSelect: (id: string) => void
  onToggleCatalogGroup: (label: string) => void
  onExportImport: () => void
  onToggleSelectionMode: () => void
  onScan: () => void
}

export function CatalogView({
  cards,
  filteredCards,
  dataLoading,
  totalCards,
  collectionValueUsd,
  collectionValueEur,
  cardsWithDexCount,
  duplicateCount,
  viewMode, onViewModeChange,
  selectedCollection,
  searchQuery, onSearchChange,
  catalogSortBy, onSortChange,
  catalogGroupBy, onGroupByChange,
  activeFiltersCount, onClearFilters,
  filterSections,
  activeFilterChips,
  catalogCols,
  catalogParentRef,
  catalogVirtualRows,
  catalogRowVirtualizer,
  isSelectionMode,
  selectedCardIds,
  onBack,
  onCardClick,
  onUpdateQuantity,
  onDelete,
  onAddToCollection,
  onRematch,
  onToggleSelect,
  onToggleCatalogGroup,
  onExportImport,
  onToggleSelectionMode,
  onScan,
}: CatalogViewProps) {
  const eurSeparator = collectionValueUsd > 0 ? ' / ' : ' • Est. value: '
  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isSelectionMode && selectedCardIds.size > 0 ? 'pt-16' : ''}`}>
      {/* ── Sticky catalog header ──────────────────────────────────────── */}
      <div className="shrink-0 container mx-auto px-4 pt-6 max-w-7xl">
        <header className="mb-4">
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="ghost" size="icon"
              onClick={onBack}
              className="shrink-0" title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-4xl font-bold font-display tracking-tight mb-1">My Catalog</h1>
              {viewMode === 'collection' && selectedCollection && (
                <p className="text-sm font-medium text-foreground/70 -mt-0.5 mb-1">
                  Collection: {selectedCollection.name}
                </p>
              )}
              <p className="text-muted-foreground">
                {cards.length === 0 ? 'No cards yet' : (
                  <>
                    {cards.length} unique {cards.length === 1 ? 'card' : 'cards'} • {totalCards} total
                    {collectionValueUsd > 0 && <> • Est. value: ${collectionValueUsd.toFixed(2)}</>}
                    {collectionValueEur > 0 && <>{eurSeparator}{collectionValueEur.toFixed(2)}€</>}
                  </>
                )}
              </p>
              {cards.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    Dex indexed: {cardsWithDexCount}/{cards.length}
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="icon" onClick={onExportImport} title="Backup & Restore">
                <Database className="w-5 h-5" />
              </Button>
              {cards.length > 0 && !isSelectionMode && (
                <Button variant="outline" size="icon" onClick={onToggleSelectionMode} title="Select Multiple Cards">
                  <CheckSquare className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>

          {cards.length > 0 && (
            <div className="space-y-4">
              <div className="relative">
                <CatalogSearchBar
                  placeholder="Search by name, set, type, or rarity..."
                  value={searchQuery}
                  onValueChange={onSearchChange}
                  inputClassName="h-12 text-base"
                />
              </div>
              <CatalogFilterControls
                sortValue={catalogSortBy}
                onSortChange={(value) => onSortChange(value as CatalogSortBy)}
                sortOptions={[
                  { value: 'national-dex', label: 'National Dex' },
                  { value: 'recent',       label: 'Recently Added' },
                  { value: 'name-asc',     label: 'Name A-Z' },
                  { value: 'name-desc',    label: 'Name Z-A' },
                ]}
                groupByValue={catalogGroupBy}
                onGroupByChange={(value) => onGroupByChange(value as CatalogGroupBy)}
                groupOptions={[
                  { value: 'none',      label: 'No Group' },
                  { value: 'supertype', label: 'Category' },
                  { value: 'type',      label: 'Type' },
                  { value: 'rarity',    label: 'Rarity' },
                ]}
                activeFiltersCount={activeFiltersCount}
                onClearFilters={onClearFilters}
                filterSections={filterSections}
                activeFilterChips={activeFilterChips}
              />
              {viewMode !== 'collection' && (
                <Tabs value={viewMode} onValueChange={v => onViewModeChange(v as ViewMode)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="all" className="font-display font-semibold">
                      All Cards <Badge variant="secondary" className="ml-2">{cards.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="duplicates" className="font-display font-semibold">
                      <Copy className="w-4 h-4 mr-1.5" /> Duplicates <Badge variant="secondary" className="ml-2">{duplicateCount}</Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
          )}
        </header>
      </div>

      {/* ── Virtual scroll area ────────────────────────────────────────── */}
      {dataLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading collection...</div>
      ) : cards.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 max-w-7xl">
            <EmptyState onScanClick={onScan} />
          </div>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-xl text-muted-foreground">No cards found</p>
          <Button variant="outline" onClick={onClearFilters}>Clear All Filters</Button>
        </div>
      ) : (
        <div
          ref={catalogParentRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <div className="container mx-auto px-4 max-w-7xl">
            <div style={{ height: `${catalogRowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {catalogRowVirtualizer.getVirtualItems().map(virtualItem => {
                const row = catalogVirtualRows[virtualItem.index]
                return (
                  <div
                    key={virtualItem.key}
                    ref={catalogRowVirtualizer.measureElement}
                    data-index={virtualItem.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {row.type === 'group-header' && (
                      <div className={row.withTopPadding ? 'pt-6 pb-3' : 'pb-3'}>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full text-left group/header"
                          onClick={() => onToggleCatalogGroup(row.label)}
                        >
                          {row.collapsed
                            ? <CaretRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover/header:text-foreground transition-colors" />
                            : <CaretDown  className="w-4 h-4 shrink-0 text-muted-foreground group-hover/header:text-foreground transition-colors" />}
                          <h3 className="text-lg font-display font-semibold">{row.label}</h3>
                          <Badge variant="outline">{row.count}</Badge>
                        </button>
                      </div>
                    )}
                    {row.type === 'card-row' && (
                      <div className={`grid gap-4 pb-4 ${
                        catalogCols === 5 ? 'grid-cols-5' :
                        catalogCols === 4 ? 'grid-cols-4' :
                        catalogCols === 3 ? 'grid-cols-3' : 'grid-cols-2'
                      }`}>
                        {row.cards.map(card => (
                          <CardItem
                            key={card.id}
                            card={card}
                            onClick={() => onCardClick(card)}
                            onUpdateQuantity={delta => onUpdateQuantity(card.id, delta)}
                            onDelete={() => onDelete(card.id)}
                            onAddToCollection={() => onAddToCollection(card)}
                            onRematch={() => onRematch(card)}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedCardIds.has(card.id)}
                            onToggleSelect={() => onToggleSelect(card.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

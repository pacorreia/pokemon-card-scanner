import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Camera } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanDialog } from '@/components/ScanDialog'
import { ScanQueueDialog } from '@/components/ScanQueueDialog'
import { CardDetailsSheet } from '@/components/CardDetailsSheet'
import { DatabaseManager } from '@/components/DatabaseManager'
import { DatabaseBrowser } from '@/components/DatabaseBrowser'
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar'
import { ExportImportDialog } from '@/components/ExportImportDialog'
import { CollectionsManager } from '@/components/CollectionsManager'
import { AddToCollectionDialog } from '@/components/AddToCollectionDialog'
import { SettingsDialog } from '@/components/SettingsDialog'
import { HomeView } from '@/components/HomeView'
import { CatalogView } from '@/components/CatalogView'
import { AuthDialog } from '@/components/AuthDialog'
import { useTCGDatabase, type TCGCard } from '@/lib/tcg-database'
import { buildPricesFromTcgCard, type ScanQueueItem } from '@/lib/card-analysis'
import { queueApi } from '@/lib/queue-api'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { useAuth } from '@/hooks/useAuth'
import { useCardCollection } from '@/hooks/useCardCollection'
import { useCatalogFilters } from '@/hooks/useCatalogFilters'
import { useCatalogVirtualizer } from '@/hooks/useCatalogVirtualizer'
import type { PokemonCard, ViewMode, CardCollection, CameraPreferences } from '@/lib/types'

function App() {
  return (
    <>
      <MainApp />
      <Toaster position="top-center" richColors />
    </>
  )
}

function MainApp() {
  const defaultCameraPreferences: CameraPreferences = {
    resolution: 'auto',
    facingMode: 'environment',
    torchEnabled: false,
    zoom: 1,
  }

  const [cameraPreferences, setCameraPreferences] = useLocalStorage<CameraPreferences>('camera-preferences', defaultCameraPreferences)

  // ── UI dialog / navigation state ──────────────────────────────────────────
  const [scanDialogOpen,         setScanDialogOpen]         = useState(false)
  const [scanQueueDialogOpen,    setScanQueueDialogOpen]    = useState(false)
  const [openScanToQueue,        setOpenScanToQueue]        = useState(false)
  const [scanQueue,              setScanQueue]              = useState<ScanQueueItem[]>([])
  const [dbManagerOpen,          setDbManagerOpen]          = useState(false)
  const [dbBrowserOpen,          setDbBrowserOpen]          = useState(false)
  const [exportImportOpen,       setExportImportOpen]       = useState(false)
  const [collectionsManagerOpen, setCollectionsManagerOpen] = useState(false)
  const [settingsOpen,           setSettingsOpen]           = useState(false)
  const [selectedCollection,     setSelectedCollection]     = useState<CardCollection | null>(null)
  const [appView,                setAppView]                = useState<'home' | 'catalog'>('home')
  const [viewMode,               setViewMode]               = useState<ViewMode>('all')
  const [isSelectionMode,        setIsSelectionMode]        = useState(false)
  const [selectedCardIds,        setSelectedCardIds]        = useState<Set<string>>(new Set())
  const [dbAutoPromptDismissed,  setDbAutoPromptDismissed]  = useState(false)

  // ── External hooks ────────────────────────────────────────────────
  const auth = useAuth()
  const { isLoaded: isDatabaseLoaded, metadata, isLoading: isDatabaseLoading, refreshStatus } = useTCGDatabase()

  const collection = useCardCollection(isDatabaseLoaded)

  const filters = useCatalogFilters({
    cards: collection.cards,
    viewMode,
    selectedCollection,
  })

  const virt = useCatalogVirtualizer({
    filteredCards:          filters.filteredCards,
    groupedCatalogCards:    filters.groupedCatalogCards,
    catalogGroupBy:         filters.catalogGroupBy,
    collapsedCatalogGroups: filters.collapsedCatalogGroups,
    appView,
  })
  const { resetScroll } = virt

  // ── Queue restoration on mount ──────────────────────────────────────────
  useEffect(() => {
    queueApi.getAll().then(serverQueue => {
      setScanQueue(prev => {
        const merged = new Map(prev.map(item => [item.id, item]))
        for (const item of serverQueue) {
          if (merged.has(item.id)) continue
          merged.set(item.id, { ...item, dataUrl: '', imageUrl: `/api/scan-queue/${item.id}/image` })
        }
        return Array.from(merged.values())
      })
    }).catch(() => {})
  }, [])

  // ── Reset catalog scroll when filters/sort/groupBy change ────────────────────
  useEffect(() => {
    resetScroll()
  }, [
    filters.searchQuery, filters.catalogSortBy, filters.catalogGroupBy,
    viewMode, filters.selectedTypes, filters.selectedRarities, filters.selectedSupertypes,
    resetScroll,
  ])

  // ── DB manager auto-prompt ────────────────────────────────────────────────
  const shouldAutoOpenDbManager =
    !dbAutoPromptDismissed && !isDatabaseLoading && !isDatabaseLoaded &&
    (metadata === null || metadata?.cardCount === 0)
  const isDbManagerOpen = dbManagerOpen || shouldAutoOpenDbManager

  const handleDbManagerOpenChange = (open: boolean) => {
    setDbManagerOpen(open)
    if (!open && shouldAutoOpenDbManager) setDbAutoPromptDismissed(true)
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleViewCollection = (col: CardCollection) => {
    setSelectedCollection(col)
    setViewMode('collection')
    setCollectionsManagerOpen(false)
    setAppView('catalog')
  }

  // ── Bulk selection ──────────────────────────────────────────────────────
  const handleToggleSelectionMode  = () => { if (isSelectionMode) setSelectedCardIds(new Set()); setIsSelectionMode(v => !v) }
  const handleToggleCardSelection  = (id: string) => setSelectedCardIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  const handleSelectAllCards       = () => setSelectedCardIds(new Set(filters.filteredCards.map(c => c.id)))
  const handleCancelBulkSelection  = () => { setSelectedCardIds(new Set()); setIsSelectionMode(false) }

  const handleBulkDelete = () => {
    collection.handleBulkDelete(selectedCardIds)
    setSelectedCardIds(new Set())
    setIsSelectionMode(false)
  }

  // ── DatabaseBrowser: add card directly to collection ───────────────────────
  const handleDbBrowserAddCard = (tcgCard: TCGCard) => {
    const card: PokemonCard = {
      id:           crypto.randomUUID(),
      name:         tcgCard.name,
      set:          tcgCard.set?.name || 'Unknown Set',
      cardNumber:   tcgCard.number || '?',
      pokedexNumber:tcgCard.nationalPokedexNumbers?.[0],
      rarity:       tcgCard.rarity || 'Common',
      type:         tcgCard.types?.[0] || 'Colorless',
      supertype:    tcgCard.supertype,
      imageUrl:     tcgCard.images?.small || tcgCard.images?.large || `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(tcgCard.name)}`,
      largeImageUrl:tcgCard.images?.large,
      quantity:     1,
      dateAdded:    Date.now(),
      prices:       buildPricesFromTcgCard(tcgCard),
      tcgCardId:    tcgCard.id,
    }
    collection.handleCardScanned(card)
  }

  const queueCount = scanQueue.filter(i => i.status === 'pending' || i.status === 'processing').length

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background">
      <AnimatePresence>
        {isSelectionMode && selectedCardIds.size > 0 && appView === 'catalog' && (
          <BulkActionsToolbar
            selectedCount={selectedCardIds.size}
            totalCount={filters.filteredCards.length}
            onCancel={handleCancelBulkSelection}
            onSelectAll={handleSelectAllCards}
            onIncreaseQuantity={() => collection.handleBulkIncreaseQuantity(selectedCardIds)}
            onDecreaseQuantity={() => collection.handleBulkDecreaseQuantity(selectedCardIds)}
            onDelete={handleBulkDelete}
          />
        )}
      </AnimatePresence>

      {appView === 'home' ? (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' } as React.CSSProperties}>
          <div className="container mx-auto px-4 pt-6 pb-24 max-w-7xl">
            <HomeView
              cardCount={collection.cards.length}
              isDatabaseLoaded={isDatabaseLoaded}
              onScan={() => { setOpenScanToQueue(false); setScanDialogOpen(true) }}
              onQueue={() => setScanQueueDialogOpen(true)}
              queueCount={queueCount}
              queueProcessing={scanQueue.some(i => i.status === 'processing')}
              onCatalog={() => setAppView('catalog')}
              onBrowseDB={() => setDbBrowserOpen(true)}
              onManageDB={() => setDbManagerOpen(true)}
              onSettings={() => setSettingsOpen(true)}
              onCollections={() => setCollectionsManagerOpen(true)}
              onImportExport={() => setExportImportOpen(true)}
            />
          </div>
        </div>
      ) : (
        <CatalogView
          cards={collection.cards}
          filteredCards={filters.filteredCards}
          dataLoading={collection.dataLoading}
          totalCards={filters.totalCards}
          collectionValueUsd={filters.collectionValueUsd}
          collectionValueEur={filters.collectionValueEur}
          cardsWithDexCount={filters.cardsWithDexCount}
          duplicateCount={filters.duplicateCount}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedCollection={selectedCollection}
          searchQuery={filters.searchQuery}
          onSearchChange={filters.setSearchQuery}
          catalogSortBy={filters.catalogSortBy}
          onSortChange={filters.setCatalogSortBy}
          catalogGroupBy={filters.catalogGroupBy}
          onGroupByChange={filters.setCatalogGroupBy}
          activeFiltersCount={filters.activeFiltersCount}
          onClearFilters={filters.handleClearFilters}
          filterSections={filters.catalogFilterSections}
          activeFilterChips={filters.catalogActiveFilterChips}
          catalogCols={virt.catalogCols}
          catalogParentRef={virt.catalogParentRef}
          catalogVirtualRows={virt.catalogVirtualRows}
          catalogRowVirtualizer={virt.catalogRowVirtualizer}
          isSelectionMode={isSelectionMode}
          selectedCardIds={selectedCardIds}
          onBack={() => { setAppView('home'); setIsSelectionMode(false); setSelectedCardIds(new Set()) }}
          onCardClick={(card) => { collection.setSelectedCard(card); collection.setDetailsOpen(true) }}
          onUpdateQuantity={collection.handleUpdateQuantity}
          onDelete={collection.handleDeleteCard}
          onAddToCollection={collection.handleAddCardToCollection}
          onRematch={(card) => { collection.setSelectedCard(card); collection.setDetailsOpen(true); collection.setRematchOnOpen(true) }}
          onToggleSelect={handleToggleCardSelection}
          onToggleCatalogGroup={filters.toggleCatalogGroup}
          onExportImport={() => setExportImportOpen(true)}
          onToggleSelectionMode={handleToggleSelectionMode}
          onScan={() => { setOpenScanToQueue(false); setScanDialogOpen(true) }}
        />
      )}

      <motion.div
        className="fixed bottom-6 right-6 flex flex-col items-end gap-3"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 20 }}
      >
        <Button
          size="lg"
          className="h-16 w-16 rounded-full shadow-2xl bg-accent hover:bg-accent/90 text-accent-foreground"
          onClick={() => { setOpenScanToQueue(false); setScanDialogOpen(true) }}
        >
          <Camera className="w-7 h-7" weight="bold" />
        </Button>
      </motion.div>

      <ScanDialog
        open={scanDialogOpen}
        onOpenChange={(v) => { setScanDialogOpen(v); if (!v) setOpenScanToQueue(false) }}
        onCardScanned={collection.handleCardScanned}
        onCardsScanned={collection.handleCardsScanned}
        cameraPreferences={cameraPreferences}
        onCameraPreferencesChange={setCameraPreferences}
        queue={scanQueue}
        onAddToQueue={(item) => setScanQueue(prev => prev.some(existing => existing.id === item.id) ? prev : [...prev, item])}
        onOpenQueue={() => { setScanDialogOpen(false); setScanQueueDialogOpen(true) }}
        openToQueue={openScanToQueue}
      />
      <ScanQueueDialog
        open={scanQueueDialogOpen}
        onOpenChange={setScanQueueDialogOpen}
        queue={scanQueue}
        onQueueChange={(updater) => setScanQueue(updater)}
        onCardScanned={collection.handleCardScanned}
        onCardsScanned={collection.handleCardsScanned}
        onOpenScanCapture={() => { setScanQueueDialogOpen(false); setOpenScanToQueue(true); setScanDialogOpen(true) }}
      />
      <CardDetailsSheet
        card={collection.selectedCard}
        open={collection.detailsOpen}
        onOpenChange={v => { collection.setDetailsOpen(v); if (!v) collection.setRematchOnOpen(false) }}
        onUpdateQuantity={collection.handleUpdateQuantity}
        onDelete={collection.handleDeleteCard}
        onCardUpdate={collection.handleCardUpdate}
        openRematch={collection.rematchOnOpen}
      />
      <DatabaseManager  open={isDbManagerOpen} onOpenChange={handleDbManagerOpenChange} onSuccess={refreshStatus} />
      <DatabaseBrowser
        open={dbBrowserOpen}
        onOpenChange={setDbBrowserOpen}
        onAddCard={handleDbBrowserAddCard}
        onAddToCollection={collection.handleDbBrowserAddToCollection}
      />
      <ExportImportDialog
        open={exportImportOpen} onOpenChange={setExportImportOpen}
        cards={collection.cards} onImport={collection.handleImport}
      />
      <CollectionsManager
        open={collectionsManagerOpen} onOpenChange={setCollectionsManagerOpen}
        collections={collection.collections}
        onCreateCollection={collection.handleCreateCollection}
        onUpdateCollection={collection.handleUpdateCollection}
        onDeleteCollection={collection.handleDeleteCollection}
        onViewCollection={handleViewCollection}
      />
      <AddToCollectionDialog
        open={collection.addToCollectionOpen} onOpenChange={collection.setAddToCollectionOpen}
        cardId={collection.selectedCardForCollection?.id || ''}
        cardName={collection.selectedCardForCollection?.name || ''}
        collections={collection.collections}
        currentCollectionIds={collection.selectedCardForCollection?.collectionIds || []}
        onToggleCollection={collection.handleToggleCardInCollection}
        onCreateNewCollection={() => { collection.setAddToCollectionOpen(false); setCollectionsManagerOpen(true) }}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        cameraPreferences={cameraPreferences}
        onCameraPreferencesChange={setCameraPreferences}
      />
      <AuthDialog
        authRequired={auth.authRequired}
        authLoginOpen={auth.authLoginOpen}
        onOpenChange={auth.setAuthLoginOpen}
        authPassword={auth.authPassword}
        onPasswordChange={auth.setAuthPassword}
        authLoginError={auth.authLoginError}
        authLoggingIn={auth.authLoggingIn}
        onSubmit={auth.handleAuthLogin}
      />
    </div>
  )
}

export default App

import { useState, useMemo, useEffect, useRef } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Camera, MagnifyingGlass, Copy, Funnel, X, CheckSquare, ArrowsDownUp, ArrowLeft } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanDialog } from '@/components/ScanDialog'
import { CardItem } from '@/components/CardItem'
import { CardDetailsSheet } from '@/components/CardDetailsSheet'
import { EmptyState } from '@/components/EmptyState'
import { DatabaseManager } from '@/components/DatabaseManager'
import { DatabaseBrowser } from '@/components/DatabaseBrowser'
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar'
import { ExportImportDialog } from '@/components/ExportImportDialog'
import { CollectionsManager } from '@/components/CollectionsManager'
import { AddToCollectionDialog } from '@/components/AddToCollectionDialog'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useTCGDatabase } from '@/lib/tcg-database'
import type { PokemonCard, ViewMode, CardCollection } from '@/lib/types'
import { toast } from 'sonner'
import { HomeView } from '@/components/HomeView'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options)
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
  return res.json() as Promise<T>
}

const api = {
  // -- Collection (user's scanned cards) ------------------------------------
  getCollection: ()                        => apiFetch<PokemonCard[]>('/api/collection'),
  addCard:       (card: PokemonCard)       => apiFetch<PokemonCard>('/api/collection', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card),
  }),
  updateCard: (id: string, patch: Partial<PokemonCard>) => apiFetch<PokemonCard>(`/api/collection/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  }),
  deleteCard: (id: string) => apiFetch<{ ok: boolean }>(`/api/collection/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // -- Named collections (folders) ------------------------------------------
  getCollections:    ()                     => apiFetch<CardCollection[]>('/api/collections'),
  createCollection:  (c: CardCollection)    => apiFetch<CardCollection>('/api/collections', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
  }),
  updateCollection:  (id: string, patch: Partial<CardCollection>) => apiFetch<CardCollection>(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  }),
  deleteCollection:  (id: string)            => apiFetch<{ ok: boolean }>(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setMembership:     (collectionId: string, cardId: string, add: boolean) =>
    apiFetch<{ ok: boolean }>(`/api/collections/${encodeURIComponent(collectionId)}/cards`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId, add }),
    }),
}

// ── Image URL helpers ────────────────────────────────────────────────────────

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const n = value.trim()
  if (!n || n === 'undefined' || n === 'null') return false
  return n.startsWith('https://') || n.startsWith('http://') || n.startsWith('data:image/')
}

function pickBestImageUrl(...candidates: Array<unknown>): string {
  for (const c of candidates) { if (isUsableImageUrl(c)) return c }
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────

function App() {
  return (
    <>
      <MainApp />
      <Toaster position="top-center" />
    </>
  )
}

function MainApp() {
  const [cards, setCards]             = useState<PokemonCard[]>([])
  const [collections, setCollections] = useState<CardCollection[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const [scanDialogOpen,        setScanDialogOpen]        = useState(false)
  const [selectedCard,          setSelectedCard]          = useState<PokemonCard | null>(null)
  const [detailsOpen,           setDetailsOpen]           = useState(false)
  const [searchQuery,           setSearchQuery]           = useState('')
  const [viewMode,              setViewMode]              = useState<ViewMode>('all')
  const [dbManagerOpen,         setDbManagerOpen]         = useState(false)
  const [dbBrowserOpen,         setDbBrowserOpen]         = useState(false)
  const [exportImportOpen,      setExportImportOpen]      = useState(false)
  const [collectionsManagerOpen,setCollectionsManagerOpen]= useState(false)
  const [addToCollectionOpen,   setAddToCollectionOpen]   = useState(false)
  const [selectedCardForCollection, setSelectedCardForCollection] = useState<PokemonCard | null>(null)
  const [settingsOpen,          setSettingsOpen]          = useState(false)
  const [selectedCollection,    setSelectedCollection]    = useState<CardCollection | null>(null)
  const [selectedTypes,         setSelectedTypes]         = useState<string[]>([])
  const [selectedRarities,      setSelectedRarities]      = useState<string[]>([])
  const [selectedSupertypes,    setSelectedSupertypes]    = useState<string[]>([])
  const [appView,               setAppView]               = useState<'home' | 'catalog'>('home')
  const [isSelectionMode,       setIsSelectionMode]       = useState(false)
  const [selectedCardIds,       setSelectedCardIds]       = useState<Set<string>>(new Set())
  const [hasCheckedDatabase,    setHasCheckedDatabase]    = useState(false)

  const updatedCardIdsRef   = useRef<Set<string>>(new Set())
  const imageUpdateRunIdRef = useRef(0)

  const { isLoaded: isDatabaseLoaded, metadata, isLoading: isDatabaseLoading, findCard, getCardById } = useTCGDatabase()

  // ── Load collection & named collections from server on mount ───────────────
  useEffect(() => {
    Promise.all([
      api.getCollection().catch(() => [] as PokemonCard[]),
      api.getCollections().catch(() => [] as CardCollection[]),
    ]).then(([serverCards, serverCollections]) => {
      setCards(serverCards)
      setCollections(serverCollections)
    }).finally(() => setDataLoading(false))
  }, [])

  // ── Auto-open DB manager when no TCG database is loaded ───────────────────
  useEffect(() => {
    if (!isDatabaseLoading && !hasCheckedDatabase) {
      setHasCheckedDatabase(true)
      if (!isDatabaseLoaded && metadata === null) {
        setDbManagerOpen(true)
      }
    }
  }, [isDatabaseLoaded, metadata, isDatabaseLoading, hasCheckedDatabase])

  // ── Back-fill images from TCG DB for cards that have placeholder images ────
  useEffect(() => {
    const runId = ++imageUpdateRunIdRef.current

    const run = async () => {
      if (!isDatabaseLoaded || cards.length === 0) return

      const needsImage = cards.filter(card =>
        card &&
        (card.imageUrl?.includes('placehold.co') || !isUsableImageUrl(card.imageUrl) ||
          (card.tcgCardId && !isUsableImageUrl(card.largeImageUrl))) &&
        !updatedCardIdsRef.current.has(card.id)
      )
      if (needsImage.length === 0) return

      const updates = new Map<string, Partial<PokemonCard>>()

      for (const card of needsImage) {
        if (imageUpdateRunIdRef.current !== runId) break
        if (updatedCardIdsRef.current.has(card.id)) continue
        try {
          const dbCard = card.tcgCardId
            ? await getCardById(card.tcgCardId)
            : await findCard(card.name, card.set, card.cardNumber)
          if (imageUpdateRunIdRef.current !== runId) break
          if (dbCard?.images?.small || dbCard?.images?.large) {
            updates.set(card.id, {
              imageUrl:     pickBestImageUrl(dbCard.images.small, dbCard.images.large),
              largeImageUrl:dbCard.images.large || undefined,
              tcgCardId:    dbCard.id,
              supertype:    dbCard.supertype || undefined,
            })
          }
        } catch { /* ignore */ }
      }

      if (updates.size > 0 && imageUpdateRunIdRef.current === runId) {
        // Persist each update to server
        for (const [id, patch] of updates) {
          try { await api.updateCard(id, patch) } catch { /* ignore image update failure */ }
          updatedCardIdsRef.current.add(id)
        }
        setCards(prev => prev.map(c => updates.has(c.id) ? { ...c, ...updates.get(c.id) } : c))
        toast.success('Card images updated', { description: `Updated ${updates.size} card${updates.size !== 1 ? 's' : ''}` })
      }
    }

    run()
  }, [isDatabaseLoaded, findCard, getCardById, cards])

  // ── Collection mutations ──────────────────────────────────────────────────

  const handleCardScanned = async (card: PokemonCard) => {
    const existing = cards.find(c => c.name === card.name && c.set === card.set && c.cardNumber === card.cardNumber)
    try {
      if (existing) {
        const patch = {
          quantity:     existing.quantity + 1,
          imageUrl:     card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : existing.imageUrl,
          largeImageUrl:card.largeImageUrl || existing.largeImageUrl,
          prices:       card.prices || existing.prices,
          tcgCardId:    card.tcgCardId || existing.tcgCardId,
          supertype:    existing.supertype || card.supertype,
        }
        const updated = await api.updateCard(existing.id, patch)
        setCards(prev => prev.map(c => c.id === existing.id ? updated : c))
        toast.info(`${card.name} already in collection!`, { description: 'Quantity increased by 1' })
      } else {
        const created = await api.addCard(card)
        setCards(prev => [...prev, created])
      }
    } catch (err) {
      toast.error('Failed to save card', { description: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const handleCardsScanned = async (newCards: PokemonCard[]) => {
    let added = 0, updated = 0
    for (const card of newCards) {
      const existing = cards.find(c => c.name === card.name && c.set === card.set && c.cardNumber === card.cardNumber)
      try {
        if (existing) {
          const patch = {
            quantity:     existing.quantity + 1,
            imageUrl:     card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : existing.imageUrl,
            largeImageUrl:card.largeImageUrl || existing.largeImageUrl,
            prices:       card.prices || existing.prices,
            tcgCardId:    card.tcgCardId || existing.tcgCardId,
          }
          const result = await api.updateCard(existing.id, patch)
          setCards(prev => prev.map(c => c.id === existing.id ? result : c))
          updated++
        } else {
          const created = await api.addCard(card)
          setCards(prev => [...prev, created])
          added++
        }
      } catch { /* continue with remaining cards */ }
    }
    const parts: string[] = []
    if (added   > 0) parts.push(`${added} new card${added !== 1 ? 's' : ''} added`)
    if (updated > 0) parts.push(`${updated} duplicate${updated !== 1 ? 's' : ''} incremented`)
    if (parts.length) toast.success(parts.join(', ') + '!')
  }

  const handleUpdateQuantity = async (cardId: string, delta: number) => {
    const card = cards.find(c => c.id === cardId)
    if (!card) return
    const newQty = Math.max(1, card.quantity + delta)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, quantity: newQty } : c))
    if (selectedCard?.id === cardId) setSelectedCard(prev => prev ? { ...prev, quantity: newQty } : null)
    try { await api.updateCard(cardId, { quantity: newQty }) } catch { /* revert */ setCards(prev => prev.map(c => c.id === cardId ? card : c)) }
  }

  const handleDeleteCard = async (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
    try { await api.deleteCard(cardId) } catch { /* non-fatal */ }
    toast.success('Card removed from collection')
  }

  const handleImport = async (importedCards: PokemonCard[]) => {
    for (const imported of importedCards) {
      const existing = cards.find(c => c.name === imported.name && c.set === imported.set && c.cardNumber === imported.cardNumber)
      try {
        if (existing) {
          const updated = await api.updateCard(existing.id, { quantity: existing.quantity + imported.quantity })
          setCards(prev => prev.map(c => c.id === existing.id ? updated : c))
        } else {
          const created = await api.addCard(imported)
          setCards(prev => [...prev, created])
        }
      } catch { /* continue */ }
    }
  }

  // ── Bulk operations ───────────────────────────────────────────────────────

  const handleBulkIncreaseQuantity = async () => {
    const ids = Array.from(selectedCardIds)
    setCards(prev => prev.map(c => selectedCardIds.has(c.id) ? { ...c, quantity: c.quantity + 1 } : c))
    for (const id of ids) {
      const card = cards.find(c => c.id === id)
      if (card) api.updateCard(id, { quantity: card.quantity + 1 }).catch(() => {})
    }
    toast.success(`Increased quantity for ${ids.length} card${ids.length !== 1 ? 's' : ''}`)
  }

  const handleBulkDecreaseQuantity = async () => {
    const ids = Array.from(selectedCardIds)
    setCards(prev => prev.map(c => selectedCardIds.has(c.id) ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c))
    for (const id of ids) {
      const card = cards.find(c => c.id === id)
      if (card) api.updateCard(id, { quantity: Math.max(1, card.quantity - 1) }).catch(() => {})
    }
    toast.success(`Decreased quantity for ${ids.length} card${ids.length !== 1 ? 's' : ''}`)
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedCardIds)
    setCards(prev => prev.filter(c => !selectedCardIds.has(c.id)))
    setSelectedCardIds(new Set())
    setIsSelectionMode(false)
    for (const id of ids) api.deleteCard(id).catch(() => {})
    toast.success(`Removed ${ids.length} card${ids.length !== 1 ? 's' : ''} from collection`)
  }

  // ── Named collections mutations ───────────────────────────────────────────

  const handleCreateCollection = async (data: Omit<CardCollection, 'id' | 'dateCreated' | 'dateModified'>) => {
    const now = Date.now()
    const col: CardCollection = { ...data, id: `collection-${now}`, dateCreated: now, dateModified: now }
    try {
      const created = await api.createCollection(col)
      setCollections(prev => [...prev, created])
    } catch (err) {
      toast.error('Failed to create collection')
    }
  }

  const handleUpdateCollection = async (id: string, updates: Partial<CardCollection>) => {
    setCollections(prev => prev.map(c => c.id === id ? { ...c, ...updates, dateModified: Date.now() } : c))
    try { await api.updateCollection(id, { ...updates, dateModified: Date.now() }) } catch { /* ignore */ }
  }

  const handleDeleteCollection = async (id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id))
    setCards(prev => prev.map(card => ({ ...card, collectionIds: (card.collectionIds || []).filter(cid => cid !== id) })))
    try { await api.deleteCollection(id) } catch { /* ignore */ }
  }

  const handleViewCollection = (collection: CardCollection) => {
    setSelectedCollection(collection)
    setViewMode('collection')
    setCollectionsManagerOpen(false)
    setAppView('catalog')
  }

  const handleAddCardToCollection = (card: PokemonCard) => {
    setSelectedCardForCollection(card)
    setAddToCollectionOpen(true)
  }

  const handleToggleCardInCollection = async (collectionId: string, add: boolean) => {
    const cardId = selectedCardForCollection?.id
    if (!cardId) return

    // Optimistic update
    setCollections(prev => prev.map(col =>
      col.id === collectionId
        ? { ...col, cardIds: add ? [...col.cardIds, cardId] : col.cardIds.filter(id => id !== cardId), dateModified: Date.now() }
        : col
    ))
    setCards(prev => prev.map(card =>
      card.id === cardId
        ? { ...card, collectionIds: add ? [...(card.collectionIds || []), collectionId] : (card.collectionIds || []).filter(id => id !== collectionId) }
        : card
    ))

    try { await api.setMembership(collectionId, cardId, add) } catch { /* ignore */ }
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  const handleCardClick   = (card: PokemonCard)    => { setSelectedCard(card); setDetailsOpen(true) }
  const handleToggleSelectionMode  = ()            => { if (isSelectionMode) setSelectedCardIds(new Set()); setIsSelectionMode(v => !v) }
  const handleToggleCardSelection  = (id: string)  => setSelectedCardIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const handleSelectAllCards       = ()            => setSelectedCardIds(new Set(filteredCards.map(c => c.id)))
  const handleCancelBulkSelection  = ()            => { setSelectedCardIds(new Set()); setIsSelectionMode(false) }

  // ── Derived state ──────────────────────────────────────────────────────────

  const availableTypes = useMemo(() => {
    const s = new Set<string>(); cards.forEach(c => c.type && s.add(c.type)); return Array.from(s).sort()
  }, [cards])
  const availableSupertypes = useMemo(() => {
    const s = new Set<string>(); cards.forEach(c => c.supertype && s.add(c.supertype)); return Array.from(s).sort()
  }, [cards])
  const availableRarities = useMemo(() => {
    const s = new Set<string>(); cards.forEach(c => c.rarity && s.add(c.rarity)); return Array.from(s).sort()
  }, [cards])

  const filteredCards = useMemo(() => {
    let f = cards
    if (viewMode === 'collection' && selectedCollection) f = f.filter(c => selectedCollection.cardIds.includes(c.id))
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      f = f.filter(c => c.name.toLowerCase().includes(q) || c.set.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || c.rarity.toLowerCase().includes(q))
    }
    if (selectedSupertypes.length) f = f.filter(c => c.supertype && selectedSupertypes.includes(c.supertype))
    if (selectedTypes.length)      f = f.filter(c => selectedTypes.includes(c.type))
    if (selectedRarities.length)   f = f.filter(c => selectedRarities.includes(c.rarity))
    if (viewMode === 'duplicates')  f = f.filter(c => c.quantity > 1)
    return f.sort((a, b) => b.dateAdded - a.dateAdded)
  }, [cards, searchQuery, viewMode, selectedTypes, selectedRarities, selectedSupertypes, selectedCollection])

  const duplicateCount  = useMemo(() => cards.filter(c => c.quantity > 1).length, [cards])
  const totalCards      = useMemo(() => cards.reduce((s, c) => s + c.quantity, 0), [cards])
  const collectionValue = useMemo(() => cards.reduce((s, c) => {
    const p = c.prices?.tcgplayer?.market || c.prices?.cardmarket?.trendPrice || 0
    return s + p * c.quantity
  }, 0), [cards])
  const activeFiltersCount = selectedTypes.length + selectedRarities.length + selectedSupertypes.length

  const handleToggleSupertype = (v: string) => setSelectedSupertypes(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  const handleToggleType      = (v: string) => setSelectedTypes(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  const handleToggleRarity    = (v: string) => setSelectedRarities(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  const handleClearFilters    = ()          => { setSelectedTypes([]); setSelectedRarities([]); setSelectedSupertypes([]); setSearchQuery('') }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {isSelectionMode && selectedCardIds.size > 0 && appView === 'catalog' && (
          <BulkActionsToolbar
            selectedCount={selectedCardIds.size}
            totalCount={filteredCards.length}
            onCancel={handleCancelBulkSelection}
            onSelectAll={handleSelectAllCards}
            onIncreaseQuantity={handleBulkIncreaseQuantity}
            onDecreaseQuantity={handleBulkDecreaseQuantity}
            onDelete={handleBulkDelete}
          />
        )}
      </AnimatePresence>

      <div className={`container mx-auto px-4 py-6 max-w-7xl ${isSelectionMode && selectedCardIds.size > 0 && appView === 'catalog' ? 'pt-24' : ''}`}>
        {appView === 'home' ? (
          <HomeView
            cardCount={cards.length}
            isDatabaseLoaded={isDatabaseLoaded}
            onScan={() => setScanDialogOpen(true)}
            onCatalog={() => setAppView('catalog')}
            onBrowseDB={() => setDbBrowserOpen(true)}
            onManageDB={() => setDbManagerOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onCollections={() => setCollectionsManagerOpen(true)}
            onImportExport={() => setExportImportOpen(true)}
          />
        ) : (
          <>
            <header className="mb-8">
              <div className="flex items-center gap-3 mb-6">
                <Button
                  variant="ghost" size="icon"
                  onClick={() => { setAppView('home'); setIsSelectionMode(false); setSelectedCardIds(new Set()) }}
                  className="shrink-0" title="Back to Home"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                  <h1 className="text-4xl font-bold font-display tracking-tight mb-1">My Catalog</h1>
                  <p className="text-muted-foreground">
                    {cards.length === 0 ? 'No cards yet' : (
                      <>
                        {cards.length} unique {cards.length === 1 ? 'card' : 'cards'} • {totalCards} total
                        {collectionValue > 0 && <> • Est. value: ${collectionValue.toFixed(2)}</>}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="icon" onClick={() => setExportImportOpen(true)} title="Backup & Restore">
                    <ArrowsDownUp className="w-5 h-5" />
                  </Button>
                  {cards.length > 0 && !isSelectionMode && (
                    <Button variant="outline" size="icon" onClick={handleToggleSelectionMode} title="Select Multiple Cards">
                      <CheckSquare className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              </div>

              {cards.length > 0 && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, set, type, or rarity..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10 h-12 text-base"
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="lg" className="h-12 px-4 relative">
                          <Funnel className="w-5 h-5 mr-2" />
                          Filters
                          {activeFiltersCount > 0 && (
                            <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5 flex items-center justify-center">
                              {activeFiltersCount}
                            </Badge>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {activeFiltersCount > 0 && (
                          <>
                            <div className="px-2 py-1.5">
                              <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={handleClearFilters}>
                                <X className="w-3 h-3 mr-1.5" /> Clear all filters
                              </Button>
                            </div>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuLabel>Card Category</DropdownMenuLabel>
                        {availableSupertypes.length > 0 ? availableSupertypes.map(s => (
                          <DropdownMenuCheckboxItem key={s} checked={selectedSupertypes.includes(s)} onCheckedChange={() => handleToggleSupertype(s)}>{s}</DropdownMenuCheckboxItem>
                        )) : <div className="px-2 py-1.5 text-sm text-muted-foreground">No categories available</div>}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Card Types</DropdownMenuLabel>
                        {availableTypes.length > 0 ? availableTypes.map(t => (
                          <DropdownMenuCheckboxItem key={t} checked={selectedTypes.includes(t)} onCheckedChange={() => handleToggleType(t)}>{t}</DropdownMenuCheckboxItem>
                        )) : <div className="px-2 py-1.5 text-sm text-muted-foreground">No types available</div>}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Rarities</DropdownMenuLabel>
                        {availableRarities.length > 0 ? availableRarities.map(r => (
                          <DropdownMenuCheckboxItem key={r} checked={selectedRarities.includes(r)} onCheckedChange={() => handleToggleRarity(r)}>{r}</DropdownMenuCheckboxItem>
                        )) : <div className="px-2 py-1.5 text-sm text-muted-foreground">No rarities available</div>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {activeFiltersCount > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedSupertypes.map(s => (
                        <Badge key={s} variant="secondary" className="pl-2.5 pr-1.5 py-1.5 gap-1.5">
                          <span className="text-xs font-medium">Category: {s}</span>
                          <button onClick={() => handleToggleSupertype(s)} className="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                      {selectedTypes.map(t => (
                        <Badge key={t} variant="secondary" className="pl-2.5 pr-1.5 py-1.5 gap-1.5">
                          <span className="text-xs font-medium">Type: {t}</span>
                          <button onClick={() => handleToggleType(t)} className="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                      {selectedRarities.map(r => (
                        <Badge key={r} variant="secondary" className="pl-2.5 pr-1.5 py-1.5 gap-1.5">
                          <span className="text-xs font-medium">Rarity: {r}</span>
                          <button onClick={() => handleToggleRarity(r)} className="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="all" className="font-display font-semibold">
                        All Cards <Badge variant="secondary" className="ml-2">{cards.length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="duplicates" className="font-display font-semibold">
                        <Copy className="w-4 h-4 mr-1.5" /> Duplicates <Badge variant="secondary" className="ml-2">{duplicateCount}</Badge>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </header>

            <main>
              {dataLoading ? (
                <div className="text-center py-20 text-muted-foreground">Loading collection...</div>
              ) : cards.length === 0 ? (
                <EmptyState onScanClick={() => setScanDialogOpen(true)} />
              ) : filteredCards.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-xl text-muted-foreground mb-4">No cards found</p>
                  <Button variant="outline" onClick={handleClearFilters}>Clear All Filters</Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredCards.map(card => card ? (
                      <CardItem
                        key={card.id}
                        card={card}
                        onClick={() => handleCardClick(card)}
                        onUpdateQuantity={delta => handleUpdateQuantity(card.id, delta)}
                        onDelete={() => handleDeleteCard(card.id)}
                        onAddToCollection={() => handleAddCardToCollection(card)}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedCardIds.has(card.id)}
                        onToggleSelect={() => handleToggleCardSelection(card.id)}
                      />
                    ) : null)}
                  </AnimatePresence>
                </div>
              )}
            </main>
          </>
        )}

        <motion.div
          className="fixed bottom-6 right-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 20 }}
        >
          <Button
            size="lg"
            className="h-16 w-16 rounded-full shadow-2xl bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={() => setScanDialogOpen(true)}
          >
            <Camera className="w-7 h-7" weight="bold" />
          </Button>
        </motion.div>
      </div>

      <ScanDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
        onCardScanned={handleCardScanned}
        onCardsScanned={handleCardsScanned}
      />
      <CardDetailsSheet
        card={selectedCard}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onUpdateQuantity={handleUpdateQuantity}
        onDelete={handleDeleteCard}
      />
      <DatabaseManager  open={dbManagerOpen}          onOpenChange={setDbManagerOpen} />
      <DatabaseBrowser  open={dbBrowserOpen}          onOpenChange={setDbBrowserOpen} />
      <ExportImportDialog
        open={exportImportOpen} onOpenChange={setExportImportOpen}
        cards={cards} onImport={handleImport}
      />
      <CollectionsManager
        open={collectionsManagerOpen} onOpenChange={setCollectionsManagerOpen}
        collections={collections}
        onCreateCollection={handleCreateCollection}
        onUpdateCollection={handleUpdateCollection}
        onDeleteCollection={handleDeleteCollection}
        onViewCollection={handleViewCollection}
      />
      <AddToCollectionDialog
        open={addToCollectionOpen} onOpenChange={setAddToCollectionOpen}
        cardId={selectedCardForCollection?.id || ''}
        cardName={selectedCardForCollection?.name || ''}
        collections={collections}
        currentCollectionIds={selectedCardForCollection?.collectionIds || []}
        onToggleCollection={handleToggleCardInCollection}
        onCreateNewCollection={() => { setAddToCollectionOpen(false); setCollectionsManagerOpen(true) }}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default App

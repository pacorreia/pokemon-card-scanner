import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Camera, Copy, CheckSquare, Database, ArrowLeft, Lock, CaretDown, CaretRight } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanDialog } from '@/components/ScanDialog'
import { ScanQueueDialog } from '@/components/ScanQueueDialog'
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
import { useTCGDatabase, type TCGCard } from '@/lib/tcg-database'
import { apiFetch } from '@/lib/api-fetch'
import { queueApi } from '@/lib/queue-api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { PokemonCard, ViewMode, CardCollection, CameraPreferences } from '@/lib/types'
import { type ScanQueueItem, buildPricesFromTcgCard } from '@/lib/card-analysis'
import { toast } from '@/lib/toast'
import { HomeView } from '@/components/HomeView'
import { CatalogSearchBar } from '@/components/shared/CatalogSearchBar'
import { CatalogFilterControls } from '@/components/shared/CatalogFilterControls'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { isUsableImageUrl, pickBestImageUrl } from '@/lib/utils'

type CatalogGroupBy = 'none' | 'supertype' | 'type' | 'rarity'
type CatalogSortBy = 'national-dex' | 'recent' | 'name-asc' | 'name-desc'

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

// ── API helpers ──────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

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

  const [cards, setCards]             = useState<PokemonCard[]>([])
  const [collections, setCollections] = useState<CardCollection[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const [scanDialogOpen,        setScanDialogOpen]        = useState(false)
  const [scanQueueDialogOpen,   setScanQueueDialogOpen]   = useState(false)
  const [openScanToQueue,       setOpenScanToQueue]       = useState(false)
  const [scanQueue,             setScanQueue]             = useState<ScanQueueItem[]>([])
  const [selectedCard,          setSelectedCard]          = useState<PokemonCard | null>(null)
  const [rematchOnOpen,         setRematchOnOpen]         = useState(false)
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
  const [catalogSortBy,         setCatalogSortBy]         = useState<CatalogSortBy>('national-dex')
  const [catalogGroupBy,        setCatalogGroupBy]        = useState<CatalogGroupBy>('none')
  const [collapsedCatalogGroups, setCollapsedCatalogGroups] = useState<Set<string>>(new Set())
  const [appView,               setAppView]               = useState<'home' | 'catalog'>('home')
  const [isSelectionMode,       setIsSelectionMode]       = useState(false)
  const [selectedCardIds,       setSelectedCardIds]       = useState<Set<string>>(new Set())
  const [dbAutoPromptDismissed, setDbAutoPromptDismissed] = useState(false)

  const updatedCardIdsRef   = useRef<Set<string>>(new Set())
  const imageUpdateRunIdRef = useRef(0)
  const dexBackfillCardIdsRef = useRef<Set<string>>(new Set())
  const addingCardKeys      = useRef(new Set<string>())

  // ── Auth (session cookie replaces VITE_API_SECRET) ────────────────────────
  const [authRequired,     setAuthRequired]     = useState(false)
  const [authLoginOpen,    setAuthLoginOpen]     = useState(false)
  const [authPassword,     setAuthPassword]      = useState('')
  const [authLoginError,   setAuthLoginError]    = useState('')
  const [authLoggingIn,    setAuthLoggingIn]     = useState(false)

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then((data: { required: boolean; authenticated: boolean }) => {
      if (data.required && !data.authenticated) {
        setAuthRequired(true)
        setAuthLoginOpen(true)
      }
    }).catch(() => { /* server not available yet; ignore */ })
  }, [])

  useEffect(() => {
    const handler = () => {
      setAuthRequired(true)
      setAuthLoginOpen(true)
    }
    window.addEventListener('auth:required', handler)
    return () => window.removeEventListener('auth:required', handler)
  }, [])

  const handleAuthLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoginError('')
    setAuthLoggingIn(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword }),
      })
      if (!res.ok) {
        setAuthLoginError('Incorrect password. Please try again.')
        return
      }
      setAuthLoginOpen(false)
      setAuthRequired(false)
      setAuthPassword('')
    } catch {
      setAuthLoginError('Could not reach the server. Please try again.')
    } finally {
      setAuthLoggingIn(false)
    }
  }, [authPassword])

  const { isLoaded: isDatabaseLoaded, metadata, isLoading: isDatabaseLoading, findCard, getCardById, refreshStatus } = useTCGDatabase()

  // ── Load collection & named collections from server on mount ───────────────
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [serverCards, serverCollections] = await Promise.all([
        api.getCollection().catch(() => [] as PokemonCard[]),
        api.getCollections().catch(() => [] as CardCollection[]),
      ])

      if (cancelled) return

      setCards(serverCards)
      setCollections(serverCollections)
      setDataLoading(false)

      // Queue restoration is best-effort and should never block app startup.
      queueApi.getAll().then(serverQueue => {
        if (cancelled) return
        setScanQueue(prev => {
          const merged = new Map(prev.map(item => [item.id, item]))
          for (const item of serverQueue) {
            if (merged.has(item.id)) continue
            merged.set(item.id, { ...item, dataUrl: '', imageUrl: `/api/scan-queue/${item.id}/image` })
          }
          return Array.from(merged.values())
        })
      }).catch(() => {})
    }

    load().catch(() => {
      if (!cancelled) setDataLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const shouldAutoOpenDbManager =
    !dbAutoPromptDismissed &&
    !isDatabaseLoading &&
    !isDatabaseLoaded &&
    (metadata === null || metadata?.cardCount === 0)

  const isDbManagerOpen = dbManagerOpen || shouldAutoOpenDbManager

  const handleDbManagerOpenChange = (open: boolean) => {
    setDbManagerOpen(open)
    if (!open && shouldAutoOpenDbManager) {
      setDbAutoPromptDismissed(true)
    }
  }

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
            const dex = dbCard.nationalPokedexNumbers?.[0]
            updates.set(card.id, {
              imageUrl:     pickBestImageUrl(dbCard.images.small, dbCard.images.large),
              largeImageUrl:dbCard.images.large || undefined,
              tcgCardId:    dbCard.id,
              supertype:    dbCard.supertype || undefined,
              pokedexNumber: typeof dex === 'number' ? dex : card.pokedexNumber,
            })
          }
        } catch { /* ignore */ }
      }

      if (updates.size > 0 && imageUpdateRunIdRef.current === runId) {
        // Persist each update to server; only mark as updated on success so
        // failed updates can be retried on the next image-backfill run.
        for (const [id, patch] of updates) {
          try {
            await api.updateCard(id, patch)
            updatedCardIdsRef.current.add(id)
          } catch { /* ignore image update failure; will retry next run */ }
        }
        setCards(prev => prev.map(c => updates.has(c.id) ? { ...c, ...updates.get(c.id) } : c))
        toast.success('Card images updated', { description: `Updated ${updates.size} card${updates.size !== 1 ? 's' : ''}` })
      }
    }

    run()
  }, [isDatabaseLoaded, findCard, getCardById, cards])

  // ── Back-fill missing national dex numbers for persisted catalog cards ───
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!isDatabaseLoaded || cards.length === 0) return

      const candidates = cards.filter(card =>
        card &&
        getNationalDexSortValue(card) === Number.POSITIVE_INFINITY &&
        !dexBackfillCardIdsRef.current.has(card.id)
      )

      if (candidates.length === 0) return

      for (const card of candidates) {
        if (cancelled) return

        try {
          const dbCard = card.tcgCardId
            ? await getCardById(card.tcgCardId)
            : await findCard(card.name, card.set, card.cardNumber)

          if (cancelled) return

          const dex = dbCard?.nationalPokedexNumbers?.[0]
          if (typeof dex === 'number' && dex > 0) {
            const patch = { pokedexNumber: dex }
            await api.updateCard(card.id, patch)
            setCards(prev => prev.map(existing => existing.id === card.id ? { ...existing, ...patch } : existing))
          }
        } catch {
          // Ignore and retry on next run if needed.
        } finally {
          dexBackfillCardIdsRef.current.add(card.id)
        }
      }
    }

    run()
    return () => { cancelled = true }
  }, [isDatabaseLoaded, cards, getCardById, findCard])

  // ── Collection mutations ──────────────────────────────────────────────────

  const getCardIdentityKey = (card: Pick<PokemonCard, 'name' | 'set' | 'cardNumber'>) =>
    `${card.name}::${card.set}::${card.cardNumber}`

  const handleCardScanned = async (card: PokemonCard) => {
    const key = getCardIdentityKey(card)
    if (addingCardKeys.current.has(key)) return
    addingCardKeys.current.add(key)
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
          pokedexNumber: card.pokedexNumber || existing.pokedexNumber,
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
    } finally {
      addingCardKeys.current.delete(key)
    }
  }

  const handleCardsScanned = async (newCards: PokemonCard[]) => {
    let added = 0, updated = 0
    // Build a local working map so intra-batch duplicates are de-duped correctly
    // even before React has had a chance to re-render with the new state.
    const localMap = new Map(cards.map(c => [getCardIdentityKey(c), c]))
    for (const card of newCards) {
      const key = getCardIdentityKey(card)
      const existing = localMap.get(key)
      try {
        if (existing) {
          const patch = {
            quantity:     existing.quantity + 1,
            imageUrl:     card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : existing.imageUrl,
            largeImageUrl:card.largeImageUrl || existing.largeImageUrl,
            prices:       card.prices || existing.prices,
            tcgCardId:    card.tcgCardId || existing.tcgCardId,
            pokedexNumber: card.pokedexNumber || existing.pokedexNumber,
          }
          const result = await api.updateCard(existing.id, patch)
          localMap.set(key, result)
          setCards(prev => prev.map(c => c.id === existing.id ? result : c))
          updated++
        } else {
          const created = await api.addCard(card)
          localMap.set(key, created)
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
    try {
      await api.updateCard(cardId, { quantity: newQty })
    } catch {
      /* revert */
      setCards(prev => prev.map(c => c.id === cardId ? card : c))
      if (selectedCard?.id === cardId) setSelectedCard(card)
    }
  }

  const handleCardUpdate = async (cardId: string, patch: Partial<PokemonCard>) => {
    const original = cards.find(c => c.id === cardId)
    if (!original) return
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, ...patch } : c))
    if (selectedCard?.id === cardId) setSelectedCard(prev => prev ? { ...prev, ...patch } : null)
    try {
      await api.updateCard(cardId, patch)
      toast.success('Card updated')
    } catch {
      setCards(prev => prev.map(c => c.id === cardId ? original : c))
      if (selectedCard?.id === cardId) setSelectedCard(original)
      toast.error('Failed to update card')
    }
  }

  const handleDeleteCard = async (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
    if (selectedCard?.id === cardId) { setSelectedCard(null); setDetailsOpen(false) }
    try { await api.deleteCard(cardId) } catch { /* non-fatal */ }
    toast.success('Card removed from collection')
  }

  const handleImport = async (importedCards: PokemonCard[]) => {
    const cardMap = new Map(cards.map(card => [getCardIdentityKey(card), card]))

    for (const imported of importedCards) {
      const key = getCardIdentityKey(imported)
      const existing = cardMap.get(key)

      try {
        if (existing) {
          const updated = await api.updateCard(existing.id, { quantity: existing.quantity + imported.quantity })
          cardMap.set(key, updated)
          setCards(prev => prev.map(c => c.id === existing.id ? updated : c))
        } else {
          const created = await api.addCard(imported)
          cardMap.set(key, created)
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
    } catch {
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

  const handleDbBrowserAddToCollection = async (tcgCard: TCGCard) => {
    const existing = cards.find(c =>
      c.tcgCardId === tcgCard.id ||
      (c.name === tcgCard.name && c.set === tcgCard.set?.name && c.cardNumber === tcgCard.number)
    )
    if (existing) {
      handleAddCardToCollection(existing)
    } else {
      try {
        const cardData: PokemonCard = {
          id: crypto.randomUUID(),
          name: tcgCard.name,
          set: tcgCard.set?.name || 'Unknown Set',
          cardNumber: tcgCard.number || '?',
          pokedexNumber: tcgCard.nationalPokedexNumbers?.[0],
          rarity: tcgCard.rarity || 'Common',
          type: tcgCard.types?.[0] || 'Colorless',
          supertype: tcgCard.supertype,
          imageUrl: tcgCard.images?.small || tcgCard.images?.large || `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(tcgCard.name)}`,
          largeImageUrl: tcgCard.images?.large,
          quantity: 1,
          dateAdded: Date.now(),
          prices: buildPricesFromTcgCard(tcgCard),
          tcgCardId: tcgCard.id,
        }
        const created = await api.addCard(cardData)
        setCards(prev => [...prev, created])
        handleAddCardToCollection(created)
      } catch (err) {
        toast.error('Failed to add card', { description: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
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
  const handleCardRematch = (card: PokemonCard)    => { setSelectedCard(card); setDetailsOpen(true); setRematchOnOpen(true) }
  const handleToggleSelectionMode  = ()            => { if (isSelectionMode) setSelectedCardIds(new Set()); setIsSelectionMode(v => !v) }
  const handleToggleCardSelection  = (id: string)  => setSelectedCardIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  const handleSelectAllCards       = ()            => setSelectedCardIds(new Set(filteredCards.map(c => c.id)))
  const handleCancelBulkSelection  = ()            => { setSelectedCardIds(new Set()); setIsSelectionMode(false) }

  // ── Derived state ──────────────────────────────────────────────────────────

  const { availableTypes, availableSupertypes, availableRarities, typeCounts, supertypeCounts, rarityCounts } = useMemo(() => {
    const typeSet = new Set<string>()
    const supertypeSet = new Set<string>()
    const raritySet = new Set<string>()
    const tCounts = new Map<string, number>()
    const stCounts = new Map<string, number>()
    const rCounts = new Map<string, number>()
    for (const card of cards) {
      if (card.type)      { typeSet.add(card.type);           tCounts.set(card.type,      (tCounts.get(card.type)      || 0) + 1) }
      if (card.supertype) { supertypeSet.add(card.supertype); stCounts.set(card.supertype, (stCounts.get(card.supertype) || 0) + 1) }
      if (card.rarity)    { raritySet.add(card.rarity);       rCounts.set(card.rarity,    (rCounts.get(card.rarity)    || 0) + 1) }
    }
    return {
      availableTypes:      Array.from(typeSet).sort(),
      availableSupertypes: Array.from(supertypeSet).sort(),
      availableRarities:   Array.from(raritySet).sort(),
      typeCounts:      tCounts,
      supertypeCounts: stCounts,
      rarityCounts:    rCounts,
    }
  }, [cards])

  const filteredCards = useMemo(() => {
    let result = cards
    if (viewMode === 'collection' && selectedCollection) result = result.filter(c => selectedCollection.cardIds.includes(c.id))
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(query) || c.set.toLowerCase().includes(query) || c.type.toLowerCase().includes(query) || c.rarity.toLowerCase().includes(query))
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
      if (catalogGroupBy === 'type') label = card.type || 'Other'
      if (catalogGroupBy === 'rarity') label = card.rarity || 'Other'

      if (!groups[label]) groups[label] = []
      groups[label].push(card)
    }

    return Object.entries(groups)
      .map(([label, groupCards]) => ({ label, cards: groupCards }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredCards, catalogGroupBy])

  // Reset collapsed groups when grouping option changes
  useEffect(() => { setCollapsedCatalogGroups(new Set()) }, [catalogGroupBy])

  const duplicateCount  = useMemo(() => cards.filter(c => c.quantity > 1).length, [cards])
  const totalCards      = useMemo(() => cards.reduce((s, c) => s + c.quantity, 0), [cards])
  const cardsWithDexCount = useMemo(
    () => cards.filter(c => typeof c.pokedexNumber === 'number' && c.pokedexNumber > 0).length,
    [cards],
  )
  const collectionValue = useMemo(() => cards.reduce((s, c) => {
    const p = c.prices?.tcgplayer?.market || c.prices?.cardmarket?.trendPrice || 0
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

  const catalogFilterSections = useMemo(() => ([
    {
      id: 'category',
      label: 'Card Category',
      emptyMessage: 'No categories available',
      options: availableSupertypes.map(s => ({
        id: `supertype:${s}`,
        label: s,
        checked: selectedSupertypes.includes(s),
        count: supertypeCounts.get(s) || 0,
        onToggle: () => handleToggleSupertype(s),
      })),
    },
    {
      id: 'types',
      label: 'Card Types',
      emptyMessage: 'No types available',
      options: availableTypes.map(t => ({
        id: `type:${t}`,
        label: t,
        checked: selectedTypes.includes(t),
        count: typeCounts.get(t) || 0,
        onToggle: () => handleToggleType(t),
      })),
    },
    {
      id: 'rarities',
      label: 'Rarities',
      emptyMessage: 'No rarities available',
      options: availableRarities.map(r => ({
        id: `rarity:${r}`,
        label: r,
        checked: selectedRarities.includes(r),
        count: rarityCounts.get(r) || 0,
        onToggle: () => handleToggleRarity(r),
      })),
    },
  ]), [
    availableSupertypes,
    availableTypes,
    availableRarities,
    selectedSupertypes,
    selectedTypes,
    selectedRarities,
    supertypeCounts,
    typeCounts,
    rarityCounts,
  ])

  const catalogActiveFilterChips = useMemo(() => ([
    ...selectedSupertypes.map(s => ({
      id: `chip-supertype:${s}`,
      label: `Category: ${s}`,
      onRemove: () => handleToggleSupertype(s),
    })),
    ...selectedTypes.map(t => ({
      id: `chip-type:${t}`,
      label: `Type: ${t}`,
      onRemove: () => handleToggleType(t),
    })),
    ...selectedRarities.map(r => ({
      id: `chip-rarity:${r}`,
      label: `Rarity: ${r}`,
      onRemove: () => handleToggleRarity(r),
    })),
  ]), [selectedSupertypes, selectedTypes, selectedRarities])

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
            onScan={() => { setOpenScanToQueue(false); setScanDialogOpen(true) }}
            onQueue={() => setScanQueueDialogOpen(true)}
            queueCount={scanQueue.length}
            queueProcessing={scanQueue.some(i => i.status === 'processing')}
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
                  {cards.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Dex indexed: {cardsWithDexCount}/{cards.length}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="icon" onClick={() => setExportImportOpen(true)} title="Backup & Restore">
                    <Database className="w-5 h-5" />
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
                  <div className="relative">
                    <CatalogSearchBar
                      placeholder="Search by name, set, type, or rarity..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      inputClassName="h-12 text-base"
                    />
                  </div>

                  <CatalogFilterControls
                    sortValue={catalogSortBy}
                    onSortChange={(value) => setCatalogSortBy(value as CatalogSortBy)}
                    sortOptions={[
                      { value: 'national-dex', label: 'National Dex' },
                      { value: 'recent', label: 'Recently Added' },
                      { value: 'name-asc', label: 'Name A-Z' },
                      { value: 'name-desc', label: 'Name Z-A' },
                    ]}
                    groupByValue={catalogGroupBy}
                    onGroupByChange={(value) => setCatalogGroupBy(value as CatalogGroupBy)}
                    groupOptions={[
                      { value: 'none', label: 'No Group' },
                      { value: 'supertype', label: 'Category' },
                      { value: 'type', label: 'Type' },
                      { value: 'rarity', label: 'Rarity' },
                    ]}
                    activeFiltersCount={activeFiltersCount}
                    onClearFilters={handleClearFilters}
                    filterSections={catalogFilterSections}
                    activeFilterChips={catalogActiveFilterChips}
                  />

                  {viewMode !== 'collection' && (
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
                  )}
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
                catalogGroupBy === 'none' ? (
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
                          onRematch={() => handleCardRematch(card)}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedCardIds.has(card.id)}
                          onToggleSelect={() => handleToggleCardSelection(card.id)}
                        />
                      ) : null)}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedCatalogCards.map(group => {
                      const isCollapsed = collapsedCatalogGroups.has(group.label)
                      return (
                        <section key={group.label}>
                          <button
                            type="button"
                            className="flex items-center gap-2 w-full text-left mb-3 group/header"
                            onClick={() => toggleCatalogGroup(group.label)}
                          >
                            {isCollapsed
                              ? <CaretRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover/header:text-foreground transition-colors" />
                              : <CaretDown className="w-4 h-4 shrink-0 text-muted-foreground group-hover/header:text-foreground transition-colors" />}
                            <h3 className="text-lg font-display font-semibold">{group.label}</h3>
                            <Badge variant="outline">{group.cards.length}</Badge>
                          </button>
                          {!isCollapsed && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                              <AnimatePresence mode="popLayout">
                                {group.cards.map(card => (
                                  <CardItem
                                    key={card.id}
                                    card={card}
                                    onClick={() => handleCardClick(card)}
                                    onUpdateQuantity={delta => handleUpdateQuantity(card.id, delta)}
                                    onDelete={() => handleDeleteCard(card.id)}
                                    onAddToCollection={() => handleAddCardToCollection(card)}
                                    onRematch={() => handleCardRematch(card)}
                                    isSelectionMode={isSelectionMode}
                                    isSelected={selectedCardIds.has(card.id)}
                                    onToggleSelect={() => handleToggleCardSelection(card.id)}
                                  />
                                ))}
                              </AnimatePresence>
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )
              )}
            </main>
          </>
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
      </div>

      <ScanDialog
        open={scanDialogOpen}
        onOpenChange={(v) => { setScanDialogOpen(v); if (!v) setOpenScanToQueue(false) }}
        onCardScanned={handleCardScanned}
        onCardsScanned={handleCardsScanned}
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
        onCardScanned={handleCardScanned}
        onCardsScanned={handleCardsScanned}
        onOpenScanCapture={() => { setScanQueueDialogOpen(false); setOpenScanToQueue(true); setScanDialogOpen(true) }}
      />
      <CardDetailsSheet
        card={selectedCard}
        open={detailsOpen}
        onOpenChange={v => { setDetailsOpen(v); if (!v) setRematchOnOpen(false) }}
        onUpdateQuantity={handleUpdateQuantity}
        onDelete={handleDeleteCard}
        onCardUpdate={handleCardUpdate}
        openRematch={rematchOnOpen}
      />
      <DatabaseManager  open={isDbManagerOpen}        onOpenChange={handleDbManagerOpenChange} onSuccess={refreshStatus} />
      <DatabaseBrowser  open={dbBrowserOpen}          onOpenChange={setDbBrowserOpen} onAddCard={(tcgCard) => {
        const card: PokemonCard = {
          id: crypto.randomUUID(),
          name: tcgCard.name,
          set: tcgCard.set?.name || 'Unknown Set',
          cardNumber: tcgCard.number || '?',
          pokedexNumber: tcgCard.nationalPokedexNumbers?.[0],
          rarity: tcgCard.rarity || 'Common',
          type: tcgCard.types?.[0] || 'Colorless',
          supertype: tcgCard.supertype,
          imageUrl: tcgCard.images?.small || tcgCard.images?.large || `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(tcgCard.name)}`,
          largeImageUrl: tcgCard.images?.large,
          quantity: 1,
          dateAdded: Date.now(),
          prices: buildPricesFromTcgCard(tcgCard),
          tcgCardId: tcgCard.id,
        }
        handleCardScanned(card)
      }} onAddToCollection={handleDbBrowserAddToCollection} />
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
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        cameraPreferences={cameraPreferences}
        onCameraPreferencesChange={setCameraPreferences}
      />

      {/* ── Auth login dialog ─────────────────────────────────────────── */}
      <Dialog open={authLoginOpen} onOpenChange={(open) => { if (!authRequired) setAuthLoginOpen(open) }}>
        <DialogContent className="sm:max-w-sm" onInteractOutside={e => e.preventDefault()}>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Lock className="w-5 h-5 text-primary" weight="fill" />
            Authentication Required
          </DialogTitle>
          <DialogDescription>
            This server is protected. Enter the password to continue.
          </DialogDescription>
          <form onSubmit={handleAuthLogin} className="flex flex-col gap-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="Enter password…"
                value={authPassword}
                onChange={e => { setAuthPassword(e.target.value); setAuthLoginError('') }}
                autoFocus
                autoComplete="current-password"
              />
              {authLoginError && <p className="text-xs text-destructive">{authLoginError}</p>}
            </div>
            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              disabled={authLoggingIn || !authPassword}
            >
              {authLoggingIn ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App

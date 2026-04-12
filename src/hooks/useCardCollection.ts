import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/collection-api'
import { findCard, getCardById, type TCGCard } from '@/lib/tcg-database'
import { buildPricesFromTcgCard } from '@/lib/card-analysis'
import { isUsableImageUrl, pickBestImageUrl } from '@/lib/utils'
import { toast } from '@/lib/toast'
import type { PokemonCard, CardCollection } from '@/lib/types'

function getCardIdentityKey(card: Pick<PokemonCard, 'name' | 'set' | 'cardNumber'>) {
  return `${card.name}::${card.set}::${card.cardNumber}`
}

function getNationalDexSortValue(card: Pick<PokemonCard, 'pokedexNumber'>): number {
  if (typeof card.pokedexNumber !== 'number' || Number.isNaN(card.pokedexNumber) || card.pokedexNumber <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return card.pokedexNumber
}

export function useCardCollection(isDatabaseLoaded: boolean) {
  const [cards,                     setCards]                     = useState<PokemonCard[]>([])
  const [collections,               setCollections]               = useState<CardCollection[]>([])
  const [dataLoading,               setDataLoading]               = useState(true)
  const [selectedCard,              setSelectedCard]              = useState<PokemonCard | null>(null)
  const [rematchOnOpen,             setRematchOnOpen]             = useState(false)
  const [detailsOpen,               setDetailsOpen]               = useState(false)
  const [addToCollectionOpen,       setAddToCollectionOpen]       = useState(false)
  const [selectedCardForCollection, setSelectedCardForCollection] = useState<PokemonCard | null>(null)

  const updatedCardIdsRef     = useRef<Set<string>>(new Set())
  const imageUpdateRunIdRef   = useRef(0)
  const dexBackfillCardIdsRef = useRef<Set<string>>(new Set())
  const addingCardKeys        = useRef(new Set<string>())

  // ── Load collection & named collections on mount ─────────────────────────
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
    }

    load().catch(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Back-fill images from TCG DB for cards with placeholder images ────────
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
              imageUrl:      pickBestImageUrl(dbCard.images.small, dbCard.images.large),
              largeImageUrl: dbCard.images.large || undefined,
              tcgCardId:     dbCard.id,
              supertype:     dbCard.supertype || undefined,
              pokedexNumber: typeof dex === 'number' ? dex : card.pokedexNumber,
            })
          }
        } catch { /* ignore */ }
      }

      if (updates.size > 0 && imageUpdateRunIdRef.current === runId) {
        for (const [id, patch] of updates) {
          try {
            await api.updateCard(id, patch)
            updatedCardIdsRef.current.add(id)
          } catch { /* ignore; will retry next run */ }
        }
        setCards(prev => prev.map(c => updates.has(c.id) ? { ...c, ...updates.get(c.id) } : c))
        toast.success('Card images updated', { description: `Updated ${updates.size} card${updates.size !== 1 ? 's' : ''}` })
      }
    }

    run()
  }, [isDatabaseLoaded, cards])

  // ── Back-fill missing national dex numbers ───────────────────────────────
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
        } catch { /* ignore */ }
        finally { dexBackfillCardIdsRef.current.add(card.id) }
      }
    }

    run()
    return () => { cancelled = true }
  }, [isDatabaseLoaded, cards])

  // ── Collection mutations ──────────────────────────────────────────────────

  const handleCardScanned = async (card: PokemonCard) => {
    const key = getCardIdentityKey(card)
    if (addingCardKeys.current.has(key)) return
    addingCardKeys.current.add(key)
    const existing = cards.find(c =>
      (card.tcgCardId && c.tcgCardId === card.tcgCardId) ||
      (c.name === card.name && c.set === card.set && c.cardNumber === card.cardNumber)
    )
    try {
      if (existing) {
        const patch = {
          quantity:      existing.quantity + 1,
          imageUrl:      card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : existing.imageUrl,
          largeImageUrl: card.largeImageUrl || existing.largeImageUrl,
          prices:        card.prices || existing.prices,
          tcgCardId:     card.tcgCardId || existing.tcgCardId,
          supertype:     existing.supertype || card.supertype,
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
    const tcgIdMap = new Map(cards.filter(c => c.tcgCardId).map(c => [c.tcgCardId!, c]))
    const localMap = new Map(cards.map(c => [getCardIdentityKey(c), c]))
    for (const card of newCards) {
      const key = getCardIdentityKey(card)
      const existing = (card.tcgCardId && tcgIdMap.get(card.tcgCardId)) || localMap.get(key)
      try {
        if (existing) {
          const patch = {
            quantity:      existing.quantity + 1,
            imageUrl:      card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : existing.imageUrl,
            largeImageUrl: card.largeImageUrl || existing.largeImageUrl,
            prices:        card.prices || existing.prices,
            tcgCardId:     card.tcgCardId || existing.tcgCardId,
            pokedexNumber: card.pokedexNumber || existing.pokedexNumber,
          }
          const result = await api.updateCard(existing.id, patch)
          localMap.set(key, result)
          if (result.tcgCardId) tcgIdMap.set(result.tcgCardId, result)
          setCards(prev => prev.map(c => c.id === existing.id ? result : c))
          updated++
        } else {
          const created = await api.addCard(card)
          localMap.set(key, created)
          if (created.tcgCardId) tcgIdMap.set(created.tcgCardId, created)
          setCards(prev => [...prev, created])
          added++
        }
      } catch { /* continue */ }
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

  // ── Bulk mutations (selectedCardIds passed by caller) ─────────────────────

  const handleBulkIncreaseQuantity = (selectedCardIds: Set<string>) => {
    const ids = Array.from(selectedCardIds)
    setCards(prev => prev.map(c => selectedCardIds.has(c.id) ? { ...c, quantity: c.quantity + 1 } : c))
    for (const id of ids) {
      const card = cards.find(c => c.id === id)
      if (card) api.updateCard(id, { quantity: card.quantity + 1 }).catch(() => {})
    }
    toast.success(`Increased quantity for ${ids.length} card${ids.length !== 1 ? 's' : ''}`)
  }

  const handleBulkDecreaseQuantity = (selectedCardIds: Set<string>) => {
    const ids = Array.from(selectedCardIds)
    setCards(prev => prev.map(c => selectedCardIds.has(c.id) ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c))
    for (const id of ids) {
      const card = cards.find(c => c.id === id)
      if (card) api.updateCard(id, { quantity: Math.max(1, card.quantity - 1) }).catch(() => {})
    }
    toast.success(`Decreased quantity for ${ids.length} card${ids.length !== 1 ? 's' : ''}`)
  }

  const handleBulkDelete = (selectedCardIds: Set<string>) => {
    const ids = Array.from(selectedCardIds)
    setCards(prev => prev.filter(c => !selectedCardIds.has(c.id)))
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
    setCards(prev => prev.map(card => ({
      ...card,
      collectionIds: (card.collectionIds || []).filter(cid => cid !== id),
    })))
    try { await api.deleteCollection(id) } catch { /* ignore */ }
  }

  // ── AddToCollection helpers ───────────────────────────────────────────────

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

  return {
    cards,
    collections,
    dataLoading,
    selectedCard, setSelectedCard,
    rematchOnOpen, setRematchOnOpen,
    detailsOpen, setDetailsOpen,
    addToCollectionOpen, setAddToCollectionOpen,
    selectedCardForCollection,
    handleCardScanned,
    handleCardsScanned,
    handleUpdateQuantity,
    handleCardUpdate,
    handleDeleteCard,
    handleImport,
    handleBulkIncreaseQuantity,
    handleBulkDecreaseQuantity,
    handleBulkDelete,
    handleCreateCollection,
    handleUpdateCollection,
    handleDeleteCollection,
    handleAddCardToCollection,
    handleDbBrowserAddToCollection,
    handleToggleCardInCollection,
  }
}

import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Camera, MagnifyingGlass, Copy, Database, BookOpen, Funnel, X, CheckSquare, ArrowsDownUp, Folders, Gear, SignOut } from '@phosphor-icons/react'
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
import { LoginPage } from '@/components/LoginPage'
import { useTCGDatabase } from '@/lib/tcg-database'
import { useAuth } from '@/contexts/AuthContext'
import type { PokemonCard, ViewMode, CardCollection } from '@/lib/types'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      {isAuthenticated ? <MainApp /> : <LoginPage />}
      <Toaster position="top-center" />
    </>
  )
}

function MainApp() {
  const { user, signOut } = useAuth()
  const [cards, setCards] = useLocalStorage<PokemonCard[]>('pokemon-cards', [])
  const [collections, setCollections] = useLocalStorage<CardCollection[]>('card-collections', [])
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [dbManagerOpen, setDbManagerOpen] = useState(false)
  const [dbBrowserOpen, setDbBrowserOpen] = useState(false)
  const [exportImportOpen, setExportImportOpen] = useState(false)
  const [collectionsManagerOpen, setCollectionsManagerOpen] = useState(false)
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)
  const [selectedCardForCollection, setSelectedCardForCollection] = useState<PokemonCard | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<CardCollection | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedRarities, setSelectedRarities] = useState<string[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set())
  const [hasCheckedDatabase, setHasCheckedDatabase] = useState(false)
  const updatedCardIdsRef = useRef<Set<string>>(new Set())
  const imageUpdateRunIdRef = useRef(0)
  
  const { isLoaded: isDatabaseLoaded, metadata, isLoading: isDatabaseLoading, findCard } = useTCGDatabase()

  useEffect(() => {
    console.log('[App] Database loaded state:', { isDatabaseLoaded, metadata, isDatabaseLoading, hasCheckedDatabase })
    if (!isDatabaseLoading && !hasCheckedDatabase) {
      setHasCheckedDatabase(true)
      if (!isDatabaseLoaded && metadata === null) {
        console.log('[App] Opening database manager - no database found')
        setDbManagerOpen(true)
      }
    }
  }, [isDatabaseLoaded, metadata, isDatabaseLoading, hasCheckedDatabase])

  useEffect(() => {
    const runId = ++imageUpdateRunIdRef.current

    const updateCardImagesFromDatabase = async () => {
      if (!isDatabaseLoaded || !cards || cards.length === 0) {
        return
      }

      const cardsNeedingImages = cards.filter(card => 
        card && (card.imageUrl?.includes('placehold.co') || !card.imageUrl) && !updatedCardIdsRef.current.has(card.id)
      )

      if (cardsNeedingImages.length === 0) {
        console.log('[App] All cards already have images')
        return
      }

      console.log(`[App] Updating ${cardsNeedingImages.length} cards with database images...`)

      let updatedCount = 0

      for (const card of cardsNeedingImages) {
        // Abort if a newer run has started or this card was already successfully updated
        if (imageUpdateRunIdRef.current !== runId) break
        if (updatedCardIdsRef.current.has(card.id)) continue

        try {
          const dbCard = await findCard(card.name, card.set, card.cardNumber)

          // Discard result if a newer run has superseded this one
          if (imageUpdateRunIdRef.current !== runId) break

          console.log(`[App] Looking up image for "${card.name}" (Set: ${card.set}, #${card.cardNumber}):`, {
            found: !!dbCard,
            hasImages: !!dbCard?.images,
            largeImage: dbCard?.images?.large,
            smallImage: dbCard?.images?.small
          })
          
          if (dbCard?.images?.large || dbCard?.images?.small) {
            const imageUrl = dbCard.images.large || dbCard.images.small
            
            setCards((currentCards) => {
              if (!currentCards) return []
              return currentCards.map(c =>
                c && c.id === card.id
                  ? {
                      ...c,
                      imageUrl: imageUrl,
                      tcgCardId: dbCard.id,
                      prices: dbCard.tcgplayer || dbCard.cardmarket ? {
                        tcgplayer: dbCard.tcgplayer ? {
                          url: dbCard.tcgplayer.url,
                          updatedAt: dbCard.tcgplayer.updatedAt,
                          ...(dbCard.tcgplayer.prices?.normal?.market && { market: dbCard.tcgplayer.prices.normal.market }),
                        } : undefined,
                        cardmarket: dbCard.cardmarket ? {
                          url: dbCard.cardmarket.url,
                          updatedAt: dbCard.cardmarket.updatedAt,
                          ...(dbCard.cardmarket.prices?.trendPrice && { trendPrice: dbCard.cardmarket.prices.trendPrice }),
                        } : undefined
                      } : c.prices
                    }
                  : c
              )
            })
            
            // Mark as successfully updated only after setCards — prevents the card from
            // being permanently locked out if this run was aborted before reaching setCards
            updatedCardIdsRef.current.add(card.id)
            updatedCount++
            console.log(`[App] ✓ Updated image for ${card.name} to: ${imageUrl}`)
          } else {
            console.log(`[App] ✗ No image found for ${card.name}`)
          }
        } catch (error) {
          console.error(`[App] Error updating card ${card.name}:`, error)
        }
      }

      if (imageUpdateRunIdRef.current === runId && updatedCount > 0) {
        toast.success('Card images updated from database', {
          description: `Updated images for ${updatedCount} ${updatedCount === 1 ? 'card' : 'cards'}`
        })
      }
    }

    updateCardImagesFromDatabase()
  }, [isDatabaseLoaded, findCard, cards, setCards])

  const handleCardScanned = (card: PokemonCard) => {
    console.log('[App] Card scanned:', {
      name: card.name,
      set: card.set,
      cardNumber: card.cardNumber,
      imageUrl: card.imageUrl,
      hasPlaceholder: card.imageUrl?.includes('placehold.co'),
      tcgCardId: card.tcgCardId
    })
    
    setCards((currentCards) => {
      const current = currentCards || []
      const existingCard = current.find(
        c => c.name === card.name && c.set === card.set && c.cardNumber === card.cardNumber
      )
      
      if (existingCard) {
        toast.info(`${card.name} already in collection!`, {
          description: 'Quantity increased by 1',
          action: {
            label: 'View',
            onClick: () => {
              setSelectedCard({ ...existingCard, quantity: existingCard.quantity + 1 })
              setDetailsOpen(true)
            }
          }
        })
        return current.map(c =>
          c.id === existingCard.id
            ? { 
                ...c, 
                quantity: c.quantity + 1,
                imageUrl: card.imageUrl && !card.imageUrl.includes('placehold.co') ? card.imageUrl : c.imageUrl,
                prices: card.prices || c.prices,
                tcgCardId: card.tcgCardId || c.tcgCardId
              }
            : c
        )
      }
      
      return [...current, card]
    })
  }

  const handleUpdateQuantity = (cardId: string, delta: number) => {
    setCards((currentCards) => {
      const current = currentCards || []
      return current.map(card =>
        card.id === cardId
          ? { ...card, quantity: Math.max(1, card.quantity + delta) }
          : card
      )
    })
    
    if (selectedCard?.id === cardId) {
      setSelectedCard(prev => prev ? { ...prev, quantity: Math.max(1, prev.quantity + delta) } : null)
    }
  }

  const handleDeleteCard = (cardId: string) => {
    setCards((currentCards) => {
      const current = currentCards || []
      return current.filter(card => card.id !== cardId)
    })
    toast.success('Card removed from collection')
  }

  const handleCardClick = (card: PokemonCard) => {
    if (!card) return
    setSelectedCard(card)
    setDetailsOpen(true)
  }

  const availableTypes = useMemo(() => {
    const types = new Set<string>()
    ;(cards || []).forEach(card => {
      if (card.type) types.add(card.type)
    })
    return Array.from(types).sort()
  }, [cards])

  const availableRarities = useMemo(() => {
    const rarities = new Set<string>()
    ;(cards || []).forEach(card => {
      if (card.rarity) rarities.add(card.rarity)
    })
    return Array.from(rarities).sort()
  }, [cards])

  const filteredCards = useMemo(() => {
    let filtered = cards || []

    if (viewMode === 'collection' && selectedCollection) {
      filtered = filtered.filter(card => selectedCollection.cardIds.includes(card.id))
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(card =>
        card.name.toLowerCase().includes(query) ||
        card.set.toLowerCase().includes(query) ||
        card.type.toLowerCase().includes(query) ||
        card.rarity.toLowerCase().includes(query)
      )
    }

    if (selectedTypes.length > 0) {
      filtered = filtered.filter(card => selectedTypes.includes(card.type))
    }

    if (selectedRarities.length > 0) {
      filtered = filtered.filter(card => selectedRarities.includes(card.rarity))
    }

    if (viewMode === 'duplicates') {
      filtered = filtered.filter(card => card.quantity > 1)
    }

    return filtered.sort((a, b) => b.dateAdded - a.dateAdded)
  }, [cards, searchQuery, viewMode, selectedTypes, selectedRarities, selectedCollection])

  const duplicateCount = useMemo(() => {
    return (cards || []).filter(card => card.quantity > 1).length
  }, [cards])

  const totalCards = useMemo(() => {
    return (cards || []).reduce((sum, card) => sum + card.quantity, 0)
  }, [cards])

  const collectionValue = useMemo(() => {
    const value = (cards || []).reduce((sum, card) => {
      const price = card.prices?.tcgplayer?.market || card.prices?.cardmarket?.trendPrice || 0
      return sum + (price * card.quantity)
    }, 0)
    return value
  }, [cards])

  const activeFiltersCount = selectedTypes.length + selectedRarities.length

  const handleToggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const handleToggleRarity = (rarity: string) => {
    setSelectedRarities(prev =>
      prev.includes(rarity) ? prev.filter(r => r !== rarity) : [...prev, rarity]
    )
  }

  const handleClearFilters = () => {
    setSelectedTypes([])
    setSelectedRarities([])
    setSearchQuery('')
  }

  const handleToggleSelectionMode = () => {
    if (isSelectionMode) {
      setSelectedCardIds(new Set())
    }
    setIsSelectionMode(!isSelectionMode)
  }

  const handleToggleCardSelection = (cardId: string) => {
    setSelectedCardIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  const handleSelectAllCards = () => {
    const allIds = new Set(filteredCards.map(card => card.id))
    setSelectedCardIds(allIds)
  }

  const handleBulkIncreaseQuantity = () => {
    setCards((currentCards) => {
      const current = currentCards || []
      return current.map(card =>
        selectedCardIds.has(card.id)
          ? { ...card, quantity: card.quantity + 1 }
          : card
      )
    })
    toast.success(`Increased quantity for ${selectedCardIds.size} ${selectedCardIds.size === 1 ? 'card' : 'cards'}`)
  }

  const handleBulkDecreaseQuantity = () => {
    setCards((currentCards) => {
      const current = currentCards || []
      return current.map(card =>
        selectedCardIds.has(card.id)
          ? { ...card, quantity: Math.max(1, card.quantity - 1) }
          : card
      )
    })
    toast.success(`Decreased quantity for ${selectedCardIds.size} ${selectedCardIds.size === 1 ? 'card' : 'cards'}`)
  }

  const handleBulkDelete = () => {
    const count = selectedCardIds.size
    setCards((currentCards) => {
      const current = currentCards || []
      return current.filter(card => !selectedCardIds.has(card.id))
    })
    setSelectedCardIds(new Set())
    setIsSelectionMode(false)
    toast.success(`Removed ${count} ${count === 1 ? 'card' : 'cards'} from collection`)
  }

  const handleCancelBulkSelection = () => {
    setSelectedCardIds(new Set())
    setIsSelectionMode(false)
  }

  const handleImport = (importedCards: PokemonCard[]) => {
    setCards((currentCards) => {
      const current = currentCards || []
      const mergedCards = [...current]
      
      importedCards.forEach(importedCard => {
        const existingIndex = mergedCards.findIndex(
          c => c.name === importedCard.name && 
               c.set === importedCard.set && 
               c.cardNumber === importedCard.cardNumber
        )
        
        if (existingIndex >= 0) {
          mergedCards[existingIndex] = {
            ...mergedCards[existingIndex],
            quantity: mergedCards[existingIndex].quantity + importedCard.quantity
          }
        } else {
          mergedCards.push(importedCard)
        }
      })
      
      return mergedCards
    })
  }

  const handleCreateCollection = (collectionData: Omit<CardCollection, 'id' | 'dateCreated' | 'dateModified'>) => {
    const now = Date.now()
    const newCollection: CardCollection = {
      ...collectionData,
      id: `collection-${now}`,
      dateCreated: now,
      dateModified: now,
    }
    setCollections((current) => [...(current || []), newCollection])
  }

  const handleUpdateCollection = (id: string, updates: Partial<CardCollection>) => {
    setCollections((current) => {
      const collections = current || []
      return collections.map(col =>
        col.id === id
          ? { ...col, ...updates, dateModified: Date.now() }
          : col
      )
    })
  }

  const handleDeleteCollection = (id: string) => {
    setCollections((current) => {
      const collections = current || []
      return collections.filter(col => col.id !== id)
    })

    setCards((currentCards) => {
      const cards = currentCards || []
      return cards.map(card => ({
        ...card,
        collectionIds: (card.collectionIds || []).filter(cid => cid !== id)
      }))
    })
  }

  const handleViewCollection = (collection: CardCollection) => {
    setSelectedCollection(collection)
    setViewMode('collection')
    setCollectionsManagerOpen(false)
  }

  const handleAddCardToCollection = (card: PokemonCard) => {
    setSelectedCardForCollection(card)
    setAddToCollectionOpen(true)
  }

  const handleToggleCardInCollection = (collectionId: string, add: boolean) => {
    const cardId = selectedCardForCollection?.id
    if (!cardId) return

    if (add) {
      setCollections((current) => {
        const collections = current || []
        return collections.map(col =>
          col.id === collectionId
            ? { ...col, cardIds: [...col.cardIds, cardId], dateModified: Date.now() }
            : col
        )
      })

      setCards((currentCards) => {
        const cards = currentCards || []
        return cards.map(card =>
          card.id === cardId
            ? { ...card, collectionIds: [...(card.collectionIds || []), collectionId] }
            : card
        )
      })
    } else {
      setCollections((current) => {
        const collections = current || []
        return collections.map(col =>
          col.id === collectionId
            ? { ...col, cardIds: col.cardIds.filter(id => id !== cardId), dateModified: Date.now() }
            : col
        )
      })

      setCards((currentCards) => {
        const cards = currentCards || []
        return cards.map(card =>
          card.id === cardId
            ? { ...card, collectionIds: (card.collectionIds || []).filter(id => id !== collectionId) }
            : card
        )
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {isSelectionMode && selectedCardIds.size > 0 && (
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

      <div className={`container mx-auto px-4 py-6 max-w-7xl ${isSelectionMode && selectedCardIds.size > 0 ? 'pt-24' : ''}`}>
        <header className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1">
              <h1 className="text-4xl font-bold font-display tracking-tight mb-2">
                PokéDex Scanner
              </h1>
              <p className="text-muted-foreground">
                {(cards || []).length === 0 ? (
                  'Build your collection'
                ) : (
                  <>
                    {(cards || []).length} unique {(cards || []).length === 1 ? 'card' : 'cards'} • {totalCards} total
                    {collectionValue > 0 && (
                      <> • Est. value: ${collectionValue.toFixed(2)}</>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0"
                title="Settings"
              >
                <Gear className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setExportImportOpen(true)}
                className="shrink-0"
                title="Backup & Restore"
              >
                <ArrowsDownUp className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDbBrowserOpen(true)}
                className="shrink-0"
                title="Browse Database"
              >
                <BookOpen className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDbManagerOpen(true)}
                className="shrink-0"
                title="Manage Database"
              >
                <Database className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCollectionsManagerOpen(true)}
                className="shrink-0"
                title="Manage Collections"
              >
                <Folders className="w-5 h-5" />
              </Button>
              {(cards || []).length > 0 && !isSelectionMode && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleSelectionMode}
                  className="shrink-0"
                  title="Select Multiple Cards"
                >
                  <CheckSquare className="w-5 h-5" />
                </Button>
              )}

              {/* User avatar + sign-out */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 overflow-hidden"
                    title={user ? `Signed in as ${user.login}` : 'Account'}
                  >
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.login}
                        className="w-full h-full object-cover rounded-[inherit]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <SignOut className="w-5 h-5" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {user && (
                    <>
                      <DropdownMenuLabel className="flex flex-col gap-0.5">
                        <span className="font-semibold">{user.name ?? user.login}</span>
                        <span className="font-normal text-muted-foreground text-xs">@{user.login}</span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={signOut} className="gap-2">
                    <SignOut className="w-4 h-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {(cards || []).length > 0 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, set, type, or rarity..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-base"
                  />
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="lg" className="h-12 px-4 relative">
                      <Funnel className="w-5 h-5 mr-2" />
                      Filters
                      {activeFiltersCount > 0 && (
                        <Badge 
                          variant="default" 
                          className="ml-2 h-5 min-w-5 px-1.5 flex items-center justify-center"
                        >
                          {activeFiltersCount}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {activeFiltersCount > 0 && (
                      <>
                        <div className="px-2 py-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs h-7"
                            onClick={handleClearFilters}
                          >
                            <X className="w-3 h-3 mr-1.5" />
                            Clear all filters
                          </Button>
                        </div>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    
                    <DropdownMenuLabel>Card Types</DropdownMenuLabel>
                    {availableTypes.length > 0 ? (
                      availableTypes.map(type => (
                        <DropdownMenuCheckboxItem
                          key={type}
                          checked={selectedTypes.includes(type)}
                          onCheckedChange={() => handleToggleType(type)}
                        >
                          {type}
                        </DropdownMenuCheckboxItem>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No types available
                      </div>
                    )}
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuLabel>Rarities</DropdownMenuLabel>
                    {availableRarities.length > 0 ? (
                      availableRarities.map(rarity => (
                        <DropdownMenuCheckboxItem
                          key={rarity}
                          checked={selectedRarities.includes(rarity)}
                          onCheckedChange={() => handleToggleRarity(rarity)}
                        >
                          {rarity}
                        </DropdownMenuCheckboxItem>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No rarities available
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {activeFiltersCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTypes.map(type => (
                    <Badge key={type} variant="secondary" className="pl-2.5 pr-1.5 py-1.5 gap-1.5">
                      <span className="text-xs font-medium">Type: {type}</span>
                      <button
                        onClick={() => handleToggleType(type)}
                        className="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {selectedRarities.map(rarity => (
                    <Badge key={rarity} variant="secondary" className="pl-2.5 pr-1.5 py-1.5 gap-1.5">
                      <span className="text-xs font-medium">Rarity: {rarity}</span>
                      <button
                        onClick={() => handleToggleRarity(rarity)}
                        className="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="all" className="font-display font-semibold">
                    All Cards
                    <Badge variant="secondary" className="ml-2">
                      {(cards || []).length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="duplicates" className="font-display font-semibold">
                    <Copy className="w-4 h-4 mr-1.5" />
                    Duplicates
                    <Badge variant="secondary" className="ml-2">
                      {duplicateCount}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
        </header>

        <main>
          {(cards || []).length === 0 ? (
            <EmptyState onScanClick={() => setScanDialogOpen(true)} />
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-xl text-muted-foreground mb-4">No cards found</p>
              <p className="text-sm text-muted-foreground mb-6">
                Try adjusting your search or filters
              </p>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear All Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredCards.map((card) => card ? (
                  <CardItem
                    key={card.id}
                    card={card}
                    onClick={() => handleCardClick(card)}
                    onUpdateQuantity={(delta) => handleUpdateQuantity(card.id, delta)}
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
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <CardDetailsSheet
        card={selectedCard}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onUpdateQuantity={handleUpdateQuantity}
        onDelete={handleDeleteCard}
      />

      <DatabaseManager
        open={dbManagerOpen}
        onOpenChange={setDbManagerOpen}
      />

      <DatabaseBrowser
        open={dbBrowserOpen}
        onOpenChange={setDbBrowserOpen}
      />

      <ExportImportDialog
        open={exportImportOpen}
        onOpenChange={setExportImportOpen}
        cards={cards || []}
        onImport={handleImport}
      />

      <CollectionsManager
        open={collectionsManagerOpen}
        onOpenChange={setCollectionsManagerOpen}
        collections={collections || []}
        onCreateCollection={handleCreateCollection}
        onUpdateCollection={handleUpdateCollection}
        onDeleteCollection={handleDeleteCollection}
        onViewCollection={handleViewCollection}
      />

      <AddToCollectionDialog
        open={addToCollectionOpen}
        onOpenChange={setAddToCollectionOpen}
        cardId={selectedCardForCollection?.id || ''}
        cardName={selectedCardForCollection?.name || ''}
        collections={collections || []}
        currentCollectionIds={selectedCardForCollection?.collectionIds || []}
        onToggleCollection={handleToggleCardInCollection}
        onCreateNewCollection={() => {
          setAddToCollectionOpen(false)
          setCollectionsManagerOpen(true)
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  )
}

export default App
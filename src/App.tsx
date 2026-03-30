import { useState, useMemo } from 'react'
import { useKV } from '@github/spark/hooks'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Camera, MagnifyingGlass, Copy } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanDialog } from '@/components/ScanDialog'
import { CardItem } from '@/components/CardItem'
import { CardDetailsSheet } from '@/components/CardDetailsSheet'
import { EmptyState } from '@/components/EmptyState'
import type { PokemonCard, ViewMode } from '@/lib/types'
import { toast } from 'sonner'

function App() {
  const [cards, setCards] = useKV<PokemonCard[]>('pokemon-cards', [])
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  const handleCardScanned = (card: PokemonCard) => {
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
            ? { ...c, quantity: c.quantity + 1 }
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
    setSelectedCard(card)
    setDetailsOpen(true)
  }

  const filteredCards = useMemo(() => {
    let filtered = cards || []

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(card =>
        card.name.toLowerCase().includes(query) ||
        card.set.toLowerCase().includes(query) ||
        card.type.toLowerCase().includes(query) ||
        card.rarity.toLowerCase().includes(query)
      )
    }

    if (viewMode === 'duplicates') {
      filtered = filtered.filter(card => card.quantity > 1)
    }

    return filtered.sort((a, b) => b.dateAdded - a.dateAdded)
  }, [cards, searchQuery, viewMode])

  const duplicateCount = useMemo(() => {
    return (cards || []).filter(card => card.quantity > 1).length
  }, [cards])

  const totalCards = useMemo(() => {
    return (cards || []).reduce((sum, card) => sum + card.quantity, 0)
  }, [cards])

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold font-display tracking-tight mb-2">
                PokéDex Scanner
              </h1>
              <p className="text-muted-foreground">
                {(cards || []).length === 0 ? (
                  'Build your collection'
                ) : (
                  <>
                    {(cards || []).length} unique {(cards || []).length === 1 ? 'card' : 'cards'} • {totalCards} total
                  </>
                )}
              </p>
            </div>
          </div>

          {(cards || []).length > 0 && (
            <div className="space-y-4">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by name, set, type, or rarity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>

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
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredCards.map((card) => (
                  <CardItem
                    key={card.id}
                    card={card}
                    onClick={() => handleCardClick(card)}
                  />
                ))}
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
      />

      <CardDetailsSheet
        card={selectedCard}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onUpdateQuantity={handleUpdateQuantity}
        onDelete={handleDeleteCard}
      />

      <Toaster position="top-center" />
    </div>
  )
}

export default App
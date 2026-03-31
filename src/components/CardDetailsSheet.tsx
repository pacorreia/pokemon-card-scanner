import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Plus, Minus, Trash, X } from '@phosphor-icons/react'
import type { PokemonCard } from '@/lib/types'

interface CardDetailsSheetProps {
  card: PokemonCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateQuantity: (cardId: string, delta: number) => void
  onDelete: (cardId: string) => void
}

const rarityColors: Record<string, string> = {
  'Common': 'bg-slate-500',
  'Uncommon': 'bg-green-500',
  'Rare': 'bg-blue-500',
  'Holo Rare': 'bg-purple-500',
  'Ultra Rare': 'bg-amber-500',
  'Secret Rare': 'bg-rose-500'
}

const typeColors: Record<string, string> = {
  'Fire': 'bg-red-500',
  'Water': 'bg-blue-500',
  'Grass': 'bg-green-500',
  'Electric': 'bg-yellow-500',
  'Psychic': 'bg-purple-500',
  'Fighting': 'bg-orange-500',
  'Darkness': 'bg-gray-800',
  'Metal': 'bg-gray-500',
  'Dragon': 'bg-indigo-500',
  'Fairy': 'bg-pink-500',
  'Colorless': 'bg-gray-400'
}

export function CardDetailsSheet({
  card,
  open,
  onOpenChange,
  onUpdateQuantity,
  onDelete
}: CardDetailsSheetProps) {
  const [zoomOpen, setZoomOpen] = useState(false)
  
  if (!card) return null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <SheetTitle className="font-display text-2xl">{card.name}</SheetTitle>
          </SheetHeader>
          
          <ScrollArea className="flex-1 px-4">
            <div className="pb-6 space-y-6">
              <div className="flex justify-center pt-2">
                <button 
                  onClick={() => setZoomOpen(true)}
                  className="w-64 aspect-[2.5/3.5] rounded-lg overflow-hidden shadow-2xl cursor-pointer hover:shadow-3xl transition-shadow active:scale-[0.98] transition-transform"
                >
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(card.name)}`
                    }}
                  />
                </button>
              </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Set</span>
                    <span className="font-medium">{card.set}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Card Number</span>
                    <span className="font-medium">#{card.cardNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Rarity</span>
                    <Badge className={`${rarityColors[card.rarity] || 'bg-gray-500'} text-white`}>
                      {card.rarity}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Type</span>
                    <Badge className={`${typeColors[card.type] || 'bg-gray-400'} text-white border-0`}>
                      {card.type}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Date Added</span>
                    <span className="font-medium">
                      {new Date(card.dateAdded).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Quantity</h3>
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onUpdateQuantity(card.id, -1)}
                    disabled={card.quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-3xl font-bold font-display min-w-[60px] text-center">
                    {card.quantity}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onUpdateQuantity(card.id, 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              <Button
                variant="destructive"
                className="w-full font-display font-semibold"
                onClick={() => {
                  onDelete(card.id)
                  onOpenChange(false)
                }}
              >
                <Trash className="w-4 h-4 mr-2" />
                Remove from Collection
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>

    <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
      <DialogContent className="max-w-full w-full h-full p-0 border-0 bg-black/95 flex items-center justify-center">
        <button
          onClick={() => setZoomOpen(false)}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-6 h-6" weight="bold" />
        </button>
        <div className="w-full max-w-2xl px-4">
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-auto rounded-lg shadow-2xl"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.src = `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(card.name)}`
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  </>
  )
}

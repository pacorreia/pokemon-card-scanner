import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { motion } from 'framer-motion'
import type { PokemonCard } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DotsThreeVertical, Eye, Plus, Minus, Trash, FolderPlus, ArrowsClockwise } from '@phosphor-icons/react'
import { useMemo, useState, memo } from 'react'
import { rarityColors, typeColors } from '@/lib/card-colors'
import { isUsableImageUrl } from '@/lib/utils'

interface CardItemProps {
  card: PokemonCard
  onClick: () => void
  onUpdateQuantity: (delta: number) => void
  onDelete: () => void
  onAddToCollection?: () => void
  onRematch?: () => void
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
}

export function CardItemBase({ card, onClick, onUpdateQuantity, onDelete, onAddToCollection, onRematch, isSelectionMode, isSelected, onToggleSelect }: CardItemProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const primaryImageUrl = useMemo(() => {
    if (isUsableImageUrl(card.imageUrl)) {
      return card.imageUrl
    }
    if (isUsableImageUrl(card.largeImageUrl)) {
      return card.largeImageUrl
    }
    return ''
  }, [card.imageUrl, card.largeImageUrl])

  // Derived: only treat current URL as errored if it's specifically the one that failed
  const imageError = failedImageUrl === primaryImageUrl && primaryImageUrl !== ''

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDropdownOpen(false)
    setDeleteDialogOpen(true)
  }

  const handleAddToCollection = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDropdownOpen(false)
    if (onAddToCollection) {
      onAddToCollection()
    }
  }

  const confirmDelete = () => {
    setDeleteDialogOpen(false)
    onDelete()
  }

  const handleClick = () => {
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect()
    } else {
      onClick()
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onToggleSelect) {
      onToggleSelect()
    }
  }

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDropdownOpen(false)
    onClick()
  }

  const handleIncreaseQuantity = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDropdownOpen(false)
    onUpdateQuantity(1)
  }

  const handleDecreaseQuantity = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDropdownOpen(false)
    onUpdateQuantity(-1)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: isSelectionMode ? 1 : 1.05, y: isSelectionMode ? 0 : -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <Card
          className={`overflow-hidden cursor-pointer hover:shadow-xl transition-all relative group ${
            isSelected ? 'ring-4 ring-primary shadow-2xl' : ''
          }`}
          onClick={handleClick}
        >
          <div className="aspect-[2.5/3.5] relative overflow-hidden bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400">
            {primaryImageUrl && !imageError ? (
              <img
                src={primaryImageUrl}
                alt={card.name}
                className="w-full h-full object-cover absolute inset-0"
                loading="lazy"
                onError={() => setFailedImageUrl(primaryImageUrl)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-4 absolute inset-0">
                <div className="text-center">
                  <div className="text-white text-lg font-bold font-display mb-1 drop-shadow-lg">
                    {card.name}
                  </div>
                  <div className="text-white/80 text-xs drop-shadow">
                    {imageError ? 'Image Load Failed' : 'No Image Available'}
                  </div>
                </div>
              </div>
            )}
            
            {isSelectionMode && (
              <div 
                className="absolute top-2 left-2 z-10"
                onClick={handleCheckboxClick}
              >
                <div className="bg-background rounded-md p-1 shadow-lg">
                  <Checkbox 
                    checked={isSelected}
                    className="w-5 h-5"
                  />
                </div>
              </div>
            )}
            
            {!isSelectionMode && (
              <div className="absolute top-2 left-2 z-10" onClick={handleMenuClick}>
                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <button className="bg-background/95 backdrop-blur-sm hover:bg-background rounded-full p-1.5 shadow-lg opacity-40 sm:opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 focus:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95">
                      <DotsThreeVertical className="w-5 h-5" weight="bold" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={handleViewDetails}>
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleAddToCollection}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Add to Collection
                    </DropdownMenuItem>
                    {onRematch && (
                      <DropdownMenuItem onClick={() => { setDropdownOpen(false); onRematch() }}>
                        <ArrowsClockwise className="w-4 h-4 mr-2" />
                        Re-match Card
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleIncreaseQuantity}>
                      <Plus className="w-4 h-4 mr-2" />
                      Increase Quantity
                    </DropdownMenuItem>
                    {card.quantity > 1 && (
                      <DropdownMenuItem onClick={handleDecreaseQuantity}>
                        <Minus className="w-4 h-4 mr-2" />
                        Decrease Quantity
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleDeleteClick}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash className="w-4 h-4 mr-2" />
                      Remove Card
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {card.quantity > 1 && (
              <div className="absolute top-2 right-2">
                <Badge className="bg-accent text-accent-foreground font-bold font-display shadow-lg">
                  ×{card.quantity}
                </Badge>
              </div>
            )}
        </div>
        <div className="p-3 space-y-2">
          <h3 className="font-display font-semibold text-sm leading-tight line-clamp-1">
            {card.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="secondary"
              className={`${rarityColors[card.rarity] || 'bg-gray-500'} text-white text-xs`}
            >
              {card.rarity}
            </Badge>
            <Badge
              variant="outline"
              className={`${typeColors[card.type] || 'bg-gray-400'} text-white border-0 text-xs`}
            >
              {card.type}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {card.set} • #{card.cardNumber}
            </p>
            {(card.prices?.tcgplayer?.market || card.prices?.cardmarket?.trendPrice) && (
              <Badge variant="outline" className="text-xs font-semibold bg-green-50 text-green-700 border-green-200 shrink-0">
                {card.prices.tcgplayer?.market 
                  ? `$${card.prices.tcgplayer.market.toFixed(2)}`
                  : card.prices.cardmarket?.trendPrice
                  ? `€${card.prices.cardmarket.trendPrice.toFixed(2)}`
                  : null
                }
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </motion.div>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {card.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this card from your collection{card.quantity > 1 ? ` (${card.quantity} copies)` : ''}. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}

export const CardItem = memo(CardItemBase)

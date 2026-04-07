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
import { DotsThreeVertical, Eye, Plus, Minus, Trash, FolderPlus } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

interface CardItemProps {
  card: PokemonCard
  onClick: () => void
  onUpdateQuantity: (delta: number) => void
  onDelete: () => void
  onAddToCollection?: () => void
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
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

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  if (!normalized || normalized === 'undefined' || normalized === 'null') return false
  if (normalized.includes('placehold.co')) return false
  return normalized.startsWith('https://') || normalized.startsWith('http://') || normalized.startsWith('data:image/')
}

export function CardItem({ card, onClick, onUpdateQuantity, onDelete, onAddToCollection, isSelectionMode, isSelected, onToggleSelect }: CardItemProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
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

  useEffect(() => {
    // Reset image error state when the primary image URL changes
    // This allows retry if a previously failed image becomes valid
  }, [primaryImageUrl])

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
                onError={() => {
                  console.error(`[CardItem] Image failed to load for ${card.name}:`, primaryImageUrl)
                  setImageError(true)
                }}
                onLoad={() => {
                  console.log(`[CardItem] Image loaded successfully for ${card.name}:`, primaryImageUrl)
                }}
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

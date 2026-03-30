import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import type { PokemonCard } from '@/lib/types'

interface CardItemProps {
  card: PokemonCard
  onClick: () => void
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

export function CardItem({ card, onClick }: CardItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="overflow-hidden cursor-pointer hover:shadow-xl transition-shadow relative group"
        onClick={onClick}
      >
        <div className="aspect-[2.5/3.5] bg-gradient-to-br from-muted to-muted/50 relative">
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.src = `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(card.name)}`
            }}
          />
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
          <p className="text-xs text-muted-foreground">
            {card.set} • #{card.cardNumber}
          </p>
        </div>
      </Card>
    </motion.div>
  )
}

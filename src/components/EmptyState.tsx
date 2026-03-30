import { CardsThree } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onScanClick: () => void
}

export function EmptyState({ onScanClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <CardsThree className="w-16 h-16 text-primary" weight="duotone" />
      </div>
      <h2 className="text-2xl font-bold font-display mb-2">No Cards Yet</h2>
      <p className="text-muted-foreground text-center mb-8 max-w-sm">
        Start building your collection by scanning your first Pokémon card!
      </p>
      <Button
        size="lg"
        className="bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
        onClick={onScanClick}
      >
        Scan Your First Card
      </Button>
    </div>
  )
}

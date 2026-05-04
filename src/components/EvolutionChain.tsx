import { useEffect, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Separator } from '@/components/ui/separator'
import { searchCards, findCardsEvolvingFrom } from '@/lib/tcg-database'
import type { TCGCard } from '@/lib/tcg-database'

interface EvolutionChainProps {
  card: TCGCard
  onCardClick: (card: TCGCard) => void
}

function EvolutionCardChip({
  card,
  isCurrent,
  onClick,
}: {
  card: TCGCard
  isCurrent?: boolean
  onClick?: () => void
}) {
  const imgSrc = card.images?.small || card.images?.large
  return (
    <button
      type="button"
      onClick={isCurrent ? undefined : onClick}
      disabled={isCurrent}
      className={[
        'flex flex-col items-center gap-1 rounded-lg p-1 transition-colors',
        isCurrent
          ? 'ring-2 ring-primary cursor-default opacity-80'
          : 'hover:bg-muted cursor-pointer',
      ].join(' ')}
    >
      <div className="w-12 h-[67px] rounded overflow-hidden bg-muted/60 flex items-center justify-center shrink-0">
        {imgSrc ? (
          <img src={imgSrc} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-[9px] text-muted-foreground text-center leading-tight p-0.5">{card.name}</span>
        )}
      </div>
      <span className="text-[11px] font-medium text-center leading-tight w-14 truncate">
        {card.name}
      </span>
      {isCurrent && (
        <span className="text-[9px] text-primary font-semibold leading-none">current</span>
      )}
    </button>
  )
}

export function EvolutionChain({ card, onCardClick }: EvolutionChainProps) {
  const [evolvesFromCard, setEvolvesFromCard] = useState<TCGCard | null>(null)
  const [evolvesToCards, setEvolvesToCards] = useState<TCGCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setEvolvesFromCard(null)
    setEvolvesToCards([])
    setLoading(true)

    const tasks: Promise<void>[] = []

    if (card.evolvesFrom) {
      tasks.push(
        searchCards(card.evolvesFrom, 30).then(results => {
          if (cancelled) return
          const exact = results.find(c => c.name === card.evolvesFrom)
          setEvolvesFromCard(exact ?? results[0] ?? null)
        }).catch(() => {})
      )
    }

    tasks.push(
      findCardsEvolvingFrom(card.name).then(results => {
        if (cancelled) return
        // One representative per unique Pokémon name
        const seen = new Map<string, TCGCard>()
        for (const c of results) {
          if (!seen.has(c.name)) seen.set(c.name, c)
        }
        setEvolvesToCards(Array.from(seen.values()))
      }).catch(() => {})
    )

    Promise.all(tasks).finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [card.id, card.name, card.evolvesFrom])

  if (loading || (!evolvesFromCard && evolvesToCards.length === 0)) return null

  return (
    <>
      <Separator />
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Evolution Path</h3>
        <div className="flex items-center gap-1 flex-wrap">
          {evolvesFromCard && (
            <>
              <EvolutionCardChip
                card={evolvesFromCard}
                onClick={() => onCardClick(evolvesFromCard)}
              />
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          )}

          <EvolutionCardChip card={card} isCurrent />

          {evolvesToCards.map((evoCard) => (
            <>
              <ArrowRight key={`arrow-${evoCard.id}`} className="w-4 h-4 text-muted-foreground shrink-0" />
              <EvolutionCardChip
                key={evoCard.id}
                card={evoCard}
                onClick={() => onCardClick(evoCard)}
              />
            </>
          ))}
        </div>
      </div>
    </>
  )
}

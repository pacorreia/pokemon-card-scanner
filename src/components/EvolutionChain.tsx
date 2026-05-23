import { useEffect, useState, Fragment } from 'react'
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

// One representative TCGCard per unique Pokémon name
function dedupByName(cards: TCGCard[]): TCGCard[] {
  const seen = new Map<string, TCGCard>()
  for (const c of cards) {
    if (!seen.has(c.name)) seen.set(c.name, c)
  }
  return Array.from(seen.values())
}

// Walk up via evolvesFrom chain to find the root card
async function findRoot(card: TCGCard, depth = 0): Promise<TCGCard> {
  if (!card.evolvesFrom || depth >= 4) return card
  const results = await searchCards(card.evolvesFrom, 30)
  const parent = results.find(c => c.name === card.evolvesFrom) ?? results[0]
  if (!parent) return card
  return findRoot(parent, depth + 1)
}

export function EvolutionChain({ card, onCardClick }: EvolutionChainProps) {
  const [stages, setStages] = useState<TCGCard[][]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setStages([])
    setLoading(true)

    ;(async () => {
      try {
        const root = await findRoot(card)
        if (cancelled) return

        const built: TCGCard[][] = [[root]]

        for (let depth = 0; depth < 4; depth++) {
          const currentStage = built[built.length - 1]

          // Fetch evolutions for all cards in the current stage in parallel
          const evoResults = await Promise.all(
            currentStage.map(stageCard => findCardsEvolvingFrom(stageCard.name))
          )
          if (cancelled) return

          const nextNames = new Set<string>()
          const nextCards: TCGCard[] = []
          for (const evos of evoResults) {
            for (const c of dedupByName(evos)) {
              if (!nextNames.has(c.name)) {
                nextNames.add(c.name)
                nextCards.push(c)
              }
            }
          }
          if (nextCards.length === 0) break
          built.push(nextCards)
          // Render each stage as it resolves instead of waiting for the full chain
          setStages([...built])
        }

        // If only root was found (no evolutions), clear
        if (built.length <= 1 && !cancelled) setStages([])
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [card])

  if (loading || stages.length === 0) return null

  return (
    <>
      <Separator />
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Evolution Path</h3>
        <div className="flex items-start gap-1 flex-wrap">
          {stages.map((stage, stageIdx) => (
            <Fragment key={stageIdx}>
              {stageIdx > 0 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-4" />
              )}
              <div className="flex flex-col gap-1">
                {stage.map((stageCard) => (
                  <EvolutionCardChip
                    key={stageCard.id}
                    card={stageCard}
                    isCurrent={stageCard.name === card.name}
                    onClick={() => onCardClick(stageCard)}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  )
}

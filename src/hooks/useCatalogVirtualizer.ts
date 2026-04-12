import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PokemonCard } from '@/lib/types'
import type { CatalogGroupBy, CatalogVirtualRow } from '@/lib/catalog-types'

const CATALOG_HEADER_HEIGHT_FIRST            = 40
const CATALOG_HEADER_HEIGHT_WITH_TOP_PADDING = 64
const CATALOG_VIRTUAL_PADDING_END            = 96

interface UseCatalogVirtualizerInput {
  filteredCards:         PokemonCard[]
  groupedCatalogCards:   Array<{ label: string; cards: PokemonCard[] }>
  catalogGroupBy:        CatalogGroupBy
  collapsedCatalogGroups:Set<string>
  appView:               'home' | 'catalog'
}

export function useCatalogVirtualizer({
  filteredCards,
  groupedCatalogCards,
  catalogGroupBy,
  collapsedCatalogGroups,
  appView,
}: UseCatalogVirtualizerInput) {
  const [catalogCols, setCatalogCols] = useState(2)
  const catalogParentRef = useRef<HTMLDivElement>(null)

  // ── Breakpoint detection ─────────────────────────────────────────────────
  useEffect(() => {
    const breakpoints = [
      { query: '(min-width: 1024px)', cols: 5 },
      { query: '(min-width: 768px)',  cols: 4 },
      { query: '(min-width: 640px)',  cols: 3 },
    ]
    const update = () => {
      for (const bp of breakpoints) {
        if (window.matchMedia(bp.query).matches) { setCatalogCols(bp.cols); return }
      }
      setCatalogCols(2)
    }
    update()
    const mqls = breakpoints.map(bp => {
      const mq = window.matchMedia(bp.query)
      mq.addEventListener('change', update)
      return mq
    })
    return () => mqls.forEach(mq => mq.removeEventListener('change', update))
  }, [])

  // ── Virtual rows ─────────────────────────────────────────────────────────
  const catalogVirtualRows = useMemo((): CatalogVirtualRow[] => {
    if (filteredCards.length === 0) return []
    const rows: CatalogVirtualRow[] = []
    if (catalogGroupBy === 'none') {
      for (let i = 0; i < filteredCards.length; i += catalogCols) {
        rows.push({ type: 'card-row', cards: filteredCards.slice(i, i + catalogCols) })
      }
    } else {
      groupedCatalogCards.forEach((group, index) => {
        const collapsed = collapsedCatalogGroups.has(group.label)
        rows.push({ type: 'group-header', label: group.label, count: group.cards.length, withTopPadding: index !== 0, collapsed })
        if (!collapsed) {
          for (let i = 0; i < group.cards.length; i += catalogCols) {
            rows.push({ type: 'card-row', cards: group.cards.slice(i, i + catalogCols) })
          }
        }
      })
    }
    return rows
  }, [filteredCards, groupedCatalogCards, catalogCols, catalogGroupBy, collapsedCatalogGroups])

  // ── Virtualizer ──────────────────────────────────────────────────────────
  const catalogRowVirtualizer = useVirtualizer({
    count: catalogVirtualRows.length,
    getScrollElement: () => catalogParentRef.current,
    measureElement: (el) => el.getBoundingClientRect().height,
    estimateSize: (index) => {
      const row = catalogVirtualRows[index]
      if (!row) return 200
      if (row.type === 'group-header') {
        return row.withTopPadding ? CATALOG_HEADER_HEIGHT_WITH_TOP_PADDING : CATALOG_HEADER_HEIGHT_FIRST
      }
      const containerWidth = catalogParentRef.current?.clientWidth ?? window.innerWidth
      const sidePadding = 32
      const gap = (catalogCols - 1) * 16
      const cardWidth = (containerWidth - sidePadding - gap) / catalogCols
      const imageHeight = cardWidth * (3.5 / 2.5)
      return Math.ceil(imageHeight + 84 + 16)
    },
    paddingEnd: CATALOG_VIRTUAL_PADDING_END,
    overscan: 3,
  })

  // Force re-measure when catalog opens or layout changes
  useEffect(() => {
    if (appView !== 'catalog' || catalogVirtualRows.length === 0) return
    const id = requestAnimationFrame(() => catalogRowVirtualizer.measure())
    return () => cancelAnimationFrame(id)
  }, [appView, catalogVirtualRows, catalogCols, catalogGroupBy, catalogRowVirtualizer])

  const resetScroll = useCallback(() => {
    if (catalogParentRef.current) catalogParentRef.current.scrollTop = 0
  }, [])

  return {
    catalogCols,
    catalogParentRef,
    catalogVirtualRows,
    catalogRowVirtualizer,
    resetScroll,
  }
}

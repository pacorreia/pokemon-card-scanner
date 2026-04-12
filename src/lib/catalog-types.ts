import type { PokemonCard } from '@/lib/types'

export type CatalogGroupBy = 'none' | 'supertype' | 'type' | 'rarity'
export type CatalogSortBy =
  | 'national-dex' | 'recent' | 'name-asc' | 'name-desc'
  | 'price-tcgplayer-market-asc'  | 'price-tcgplayer-market-desc'
  | 'price-tcgplayer-low-asc'     | 'price-tcgplayer-low-desc'
  | 'price-tcgplayer-mid-asc'     | 'price-tcgplayer-mid-desc'
  | 'price-tcgplayer-high-asc'    | 'price-tcgplayer-high-desc'
  | 'price-cardmarket-trend-asc'  | 'price-cardmarket-trend-desc'
  | 'price-cardmarket-avg-asc'    | 'price-cardmarket-avg-desc'
  | 'price-cardmarket-low-asc'    | 'price-cardmarket-low-desc'

export type CatalogVirtualRow =
  | { type: 'group-header'; label: string; count: number; withTopPadding: boolean; collapsed: boolean }
  | { type: 'card-row'; cards: PokemonCard[] }

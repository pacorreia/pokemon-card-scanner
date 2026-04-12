import type { PokemonCard } from '@/lib/types'

export type CatalogGroupBy = 'none' | 'supertype' | 'type' | 'rarity'
export type CatalogSortBy = 'national-dex' | 'recent' | 'name-asc' | 'name-desc'

export type CatalogVirtualRow =
  | { type: 'group-header'; label: string; count: number; withTopPadding: boolean; collapsed: boolean }
  | { type: 'card-row'; cards: PokemonCard[] }

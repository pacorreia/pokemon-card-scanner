export interface PokemonCard {
  id: string
  name: string
  set: string
  cardNumber: string
  rarity: string
  type: string
  imageUrl: string
  quantity: number
  dateAdded: number
}

export type ViewMode = 'all' | 'duplicates'

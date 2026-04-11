export interface CardPrices {
  tcgplayer?: {
    url?: string
    updatedAt?: string
    normal?: number
    holofoil?: number
    reverseHolofoil?: number
    '1stEditionHolofoil'?: number
    '1stEditionNormal'?: number
    market?: number
    low?: number
    mid?: number
    high?: number
  }
  cardmarket?: {
    url?: string
    updatedAt?: string
    averageSellPrice?: number
    lowPrice?: number
    trendPrice?: number
    germanProLow?: number
    suggestedPrice?: number
    reverseHoloSell?: number
    reverseHoloLow?: number
    reverseHoloTrend?: number
    lowPriceExPlus?: number
    avg1?: number
    avg7?: number
    avg30?: number
    reverseHoloAvg1?: number
    reverseHoloAvg7?: number
    reverseHoloAvg30?: number
  }
}

export interface PokemonCard {
  id: string
  name: string
  set: string
  cardNumber: string
  pokedexNumber?: number
  rarity: string
  type: string
  supertype?: string
  imageUrl: string
  largeImageUrl?: string
  quantity: number
  dateAdded: number
  prices?: CardPrices
  tcgCardId?: string
  collectionIds?: string[]
}

export interface CardCollection {
  id: string
  name: string
  description?: string
  color: string
  icon: string
  cardIds: string[]
  dateCreated: number
  dateModified: number
}

export type ViewMode = 'all' | 'duplicates' | 'collection'

export interface CameraPreferences {
  resolution: 'auto' | 'hd' | 'fullhd' | 'qhd'
  facingMode: 'environment' | 'user'
  torchEnabled: boolean
  zoom: number
}

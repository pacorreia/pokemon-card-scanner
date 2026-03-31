import { useKV } from '@github/spark/hooks'
import { useEffect } from 'react'

declare const spark: {
  kv: {
    get: <T>(key: string) => Promise<T | undefined>
    set: <T>(key: string, value: T) => Promise<void>
    delete: (key: string) => Promise<void>
    keys: () => Promise<string[]>
  }
}

export interface TCGCard {
  id: string
  name: string
  supertype: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  evolvesFrom?: string
  abilities?: Array<{
    name: string
    text: string
    type: string
  }>
  attacks?: Array<{
    name: string
    cost: string[]
    convertedEnergyCost: number
    damage: string
    text: string
  }>
  weaknesses?: Array<{
    type: string
    value: string
  }>
  resistances?: Array<{
    type: string
    value: string
  }>
  retreatCost?: string[]
  convertedRetreatCost?: number
  set: {
    id: string
    name: string
    series: string
    printedTotal: number
    total: number
    legalities: {
      unlimited?: string
      standard?: string
      expanded?: string
    }
    ptcgoCode?: string
    releaseDate: string
    updatedAt: string
    images: {
      symbol: string
      logo: string
    }
  }
  number: string
  artist?: string
  rarity?: string
  flavorText?: string
  nationalPokedexNumbers?: number[]
  legalities: {
    unlimited?: string
    standard?: string
    expanded?: string
  }
  images: {
    small: string
    large: string
  }
  tcgplayer?: {
    url: string
    updatedAt: string
    prices?: any
  }
  cardmarket?: {
    url: string
    updatedAt: string
    prices?: any
  }
}

export interface TCGSet {
  id: string
  name: string
  series: string
  printedTotal: number
  total: number
  legalities: {
    unlimited?: string
    standard?: string
    expanded?: string
  }
  ptcgoCode?: string
  releaseDate: string
  updatedAt: string
  images: {
    symbol: string
    logo: string
  }
}

export interface DatabaseMetadata {
  lastUpdated: number
  cardCount: number
  setCount: number
}

async function fetchJSONFilesDirectly(onProgress?: (current: number, total: number, message: string) => void): Promise<{ cards: TCGCard[]; sets: TCGSet[] }> {
  onProgress?.(5, 100, 'Fetching latest release info...')
  
  let releaseData
  try {
    const response = await fetch('https://api.github.com/repos/PokemonTCG/pokemon-tcg-data/releases/latest', {
      headers: {
        'Accept': 'application/vnd.github+json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`)
    }
    
    releaseData = await response.json()
  } catch (error) {
    console.error('Failed to fetch release:', error)
    throw new Error(`Failed to fetch release info: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  const tagName = releaseData.tag_name
  console.log('Latest release tag:', tagName)
  
  onProgress?.(10, 100, 'Finding available card sets...')
  
  const baseUrl = `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/${tagName}`
  
  const cardsBaseUrl = `${baseUrl}/cards/en`
  const setsBaseUrl = `${baseUrl}/sets/en`
  
  onProgress?.(15, 100, 'Fetching sets list...')
  
  let setsList: string[] = []
  try {
    const setsApiResponse = await fetch(`https://api.github.com/repos/PokemonTCG/pokemon-tcg-data/contents/sets/en?ref=${tagName}`, {
      headers: {
        'Accept': 'application/vnd.github+json'
      }
    })
    
    if (setsApiResponse.ok) {
      const setsFiles = await setsApiResponse.json()
      setsList = setsFiles
        .filter((file: any) => file.name.endsWith('.json') && file.type === 'file')
        .map((file: any) => file.name)
    }
  } catch (error) {
    console.error('Failed to fetch sets list:', error)
  }
  
  onProgress?.(20, 100, 'Fetching cards list...')
  
  let cardsList: string[] = []
  try {
    const cardsApiResponse = await fetch(`https://api.github.com/repos/PokemonTCG/pokemon-tcg-data/contents/cards/en?ref=${tagName}`, {
      headers: {
        'Accept': 'application/vnd.github+json'
      }
    })
    
    if (cardsApiResponse.ok) {
      const cardsFiles = await cardsApiResponse.json()
      cardsList = cardsFiles
        .filter((file: any) => file.name.endsWith('.json') && file.type === 'file')
        .map((file: any) => file.name)
    }
  } catch (error) {
    console.error('Failed to fetch cards list:', error)
  }
  
  const totalFiles = setsList.length + cardsList.length
  console.log(`Found ${setsList.length} set files and ${cardsList.length} card files`)
  
  if (totalFiles === 0) {
    throw new Error('No JSON files found in repository. The repository structure may have changed.')
  }
  
  const cards: TCGCard[] = []
  const sets: TCGSet[] = []
  let processedFiles = 0
  
  onProgress?.(25, 100, `Downloading ${setsList.length} set files...`)
  
  for (const setFile of setsList) {
    try {
      const url = `${setsBaseUrl}/${setFile}`
      const response = await fetch(url)
      
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          sets.push(...data)
        } else {
          sets.push(data)
        }
      }
    } catch (error) {
      console.error(`Failed to fetch set file ${setFile}:`, error)
    }
    
    processedFiles++
    const progress = 25 + (processedFiles / totalFiles) * 70
    onProgress?.(progress, 100, `Downloading files... ${processedFiles}/${totalFiles}`)
  }
  
  onProgress?.(50, 100, `Downloading ${cardsList.length} card files...`)
  
  for (const cardFile of cardsList) {
    try {
      const url = `${cardsBaseUrl}/${cardFile}`
      const response = await fetch(url)
      
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          cards.push(...data)
        } else {
          cards.push(data)
        }
      }
    } catch (error) {
      console.error(`Failed to fetch card file ${cardFile}:`, error)
    }
    
    processedFiles++
    const progress = 25 + (processedFiles / totalFiles) * 70
    onProgress?.(progress, 100, `Downloading files... ${processedFiles}/${totalFiles}`)
  }
  
  return { cards, sets }
}

export async function downloadCardDatabase(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ cards: TCGCard[]; sets: TCGSet[] }> {
  try {
    onProgress?.(0, 100, 'Preparing to download...')
    
    const { cards, sets } = await fetchJSONFilesDirectly(onProgress)
    
    onProgress?.(95, 100, 'Finalizing...')
    
    if (cards.length === 0) {
      throw new Error('No cards were loaded from the database. Please try again.')
    }
    
    console.log(`Database download complete: ${cards.length} cards, ${sets.length} sets`)
    
    onProgress?.(100, 100, 'Complete!')
    
    return { cards, sets }
  } catch (error) {
    console.error('Failed to download card database:', error)
    throw error
  }
}

export function useTCGDatabase() {
  const [cards, setCards] = useKV<TCGCard[]>('tcg-database-cards', [])
  const [sets, setSets] = useKV<TCGSet[]>('tcg-database-sets', [])
  const [metadata, setMetadata] = useKV<DatabaseMetadata | null>('tcg-database-metadata', null)

  useEffect(() => {
    console.log('[TCG Database] Current state:', {
      cardsLength: cards?.length ?? 0,
      setsLength: sets?.length ?? 0,
      metadata,
      metadataCardCount: metadata?.cardCount ?? 0,
    })
  }, [cards, sets, metadata])

  const updateDatabase = async (onProgress?: (current: number, total: number, message: string) => void) => {
    try {
      const { cards: newCards, sets: newSets } = await downloadCardDatabase(onProgress)
      
      console.log('[TCG Database] Downloaded data:', {
        cardsCount: newCards.length,
        setsCount: newSets.length
      })
      
      const newMetadata: DatabaseMetadata = {
        lastUpdated: Date.now(),
        cardCount: newCards.length,
        setCount: newSets.length
      }
      
      console.log('[TCG Database] Saving to KV storage...')
      
      await spark.kv.set('tcg-database-cards', newCards)
      await spark.kv.set('tcg-database-sets', newSets)
      await spark.kv.set('tcg-database-metadata', newMetadata)
      
      setCards(() => newCards)
      setSets(() => newSets)
      setMetadata(() => newMetadata)
      
      console.log('[TCG Database] Data saved to KV storage')
      
      const verifyCards = await spark.kv.get<TCGCard[]>('tcg-database-cards')
      const verifySets = await spark.kv.get<TCGSet[]>('tcg-database-sets')
      const verifyMetadata = await spark.kv.get<DatabaseMetadata>('tcg-database-metadata')
      
      console.log('[TCG Database] Verification:', {
        cardsStored: verifyCards?.length ?? 0,
        setsStored: verifySets?.length ?? 0,
        metadataStored: verifyMetadata
      })
      
      return { success: true }
    } catch (error) {
      console.error('Database update failed:', error)
      return { success: false, error }
    }
  }

  const searchCards = (query: string, limit = 10): TCGCard[] => {
    if (!cards || cards.length === 0) return []
    
    const lowerQuery = query.toLowerCase()
    const safeCards = cards || []
    const results = safeCards.filter(card => {
      return (
        card.name.toLowerCase().includes(lowerQuery) ||
        card.set.name.toLowerCase().includes(lowerQuery) ||
        card.number.includes(query)
      )
    })
    
    return results.slice(0, limit)
  }

  const findCard = (name: string, setName?: string, cardNumber?: string): TCGCard | null => {
    if (!cards || cards.length === 0) return null
    
    const lowerName = name.toLowerCase()
    const safeCards = cards || []
    
    let matches = safeCards.filter(card => 
      card.name.toLowerCase() === lowerName
    )
    
    if (setName && matches.length > 1) {
      const lowerSet = setName.toLowerCase()
      matches = matches.filter(card => 
        card.set.name.toLowerCase().includes(lowerSet) ||
        card.set.series.toLowerCase().includes(lowerSet)
      )
    }
    
    if (cardNumber && matches.length > 1) {
      const numberPart = cardNumber.split('/')[0]
      matches = matches.filter(card => 
        card.number === numberPart || card.number === cardNumber
      )
    }
    
    return matches[0] || null
  }

  const isLoaded = metadata !== null && (metadata?.cardCount ?? 0) > 0 && (cards?.length ?? 0) > 0

  return {
    cards,
    sets,
    metadata,
    isLoaded,
    updateDatabase,
    searchCards,
    findCard
  }
}

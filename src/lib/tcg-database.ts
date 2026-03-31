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
    const loadCardsFromChunks = async () => {
      if (metadata && metadata.cardCount > 0 && (!cards || cards.length === 0)) {
        console.log('[TCG Database] Loading cards from chunks...')
        const chunkCount = await spark.kv.get<number>('tcg-database-chunk-count')
        
        if (chunkCount && chunkCount > 0) {
          const allCards: TCGCard[] = []
          
          for (let i = 0; i < chunkCount; i++) {
            const chunk = await spark.kv.get<TCGCard[]>(`tcg-database-cards-chunk-${i}`)
            if (chunk) {
              allCards.push(...chunk)
            }
          }
          
          console.log(`[TCG Database] Loaded ${allCards.length} cards from ${chunkCount} chunks`)
          setCards(() => allCards)
        }
      }
    }
    
    loadCardsFromChunks()
  }, [metadata, cards, setCards])

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
      
      const CHUNK_SIZE = 100
      const cardChunks: TCGCard[][] = []
      
      for (let i = 0; i < newCards.length; i += CHUNK_SIZE) {
        cardChunks.push(newCards.slice(i, i + CHUNK_SIZE))
      }
      
      console.log(`[TCG Database] Splitting cards into ${cardChunks.length} chunks`)
      onProgress?.(95, 100, `Preparing to save ${cardChunks.length} chunks...`)
      
      try {
        const allKeys = await spark.kv.keys()
        const oldChunkKeys = allKeys.filter(key => key.startsWith('tcg-database-cards-chunk-'))
        onProgress?.(96, 100, `Cleaning up ${oldChunkKeys.length} old chunks...`)
        for (const key of oldChunkKeys) {
          await spark.kv.delete(key)
        }
        console.log(`[TCG Database] Deleted ${oldChunkKeys.length} old chunk keys`)
      } catch (error) {
        console.warn('[TCG Database] Could not clean old chunks (this is OK for first install):', error)
      }
      
      onProgress?.(97, 100, `Saving chunk 0/${cardChunks.length}...`)
      
      const chunkStartTime = Date.now()
      const chunkTimes: number[] = []
      
      for (let i = 0; i < cardChunks.length; i++) {
        const chunkKey = `tcg-database-cards-chunk-${i}`
        const chunkNumber = i + 1
        const percentComplete = Math.round((chunkNumber / cardChunks.length) * 100)
        let timeMessage = ''
        
        if (chunkTimes.length > 0) {
          const avgTimePerChunk = chunkTimes.reduce((a, b) => a + b, 0) / chunkTimes.length
          const chunksRemaining = cardChunks.length - chunkNumber
          const estimatedSecondsRemaining = Math.ceil((avgTimePerChunk * chunksRemaining) / 1000)
          
          if (estimatedSecondsRemaining < 60) {
            timeMessage = ` • ~${estimatedSecondsRemaining}s remaining`
          } else {
            const minutes = Math.floor(estimatedSecondsRemaining / 60)
            const seconds = estimatedSecondsRemaining % 60
            timeMessage = ` • ~${minutes}m ${seconds}s remaining`
          }
        }
        
        onProgress?.(97, 100, `Saving chunk ${chunkNumber}/${cardChunks.length} (${percentComplete}%)${timeMessage}`)
        
        const chunkSaveStart = Date.now()
        try {
          await spark.kv.set(chunkKey, cardChunks[i])
          const chunkSaveTime = Date.now() - chunkSaveStart
          chunkTimes.push(chunkSaveTime)
          console.log(`[TCG Database] ✓ Saved chunk ${chunkNumber}/${cardChunks.length} (${cardChunks[i].length} cards, ${chunkSaveTime}ms)`)
        } catch (error) {
          console.error(`[TCG Database] ✗ Failed to save chunk ${chunkNumber}:`, error)
          throw new Error(`Failed to save data chunk ${chunkNumber}/${cardChunks.length}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      const totalChunkSaveTime = Date.now() - chunkStartTime
      console.log(`[TCG Database] Total chunk save time: ${(totalChunkSaveTime / 1000).toFixed(1)}s`)
      
      onProgress?.(99, 100, `All ${cardChunks.length} chunks saved! Finalizing...`)
      
      const newMetadata: DatabaseMetadata = {
        lastUpdated: Date.now(),
        cardCount: newCards.length,
        setCount: newSets.length
      }
      
      await spark.kv.set('tcg-database-sets', newSets)
      await spark.kv.set('tcg-database-metadata', newMetadata)
      await spark.kv.set('tcg-database-chunk-count', cardChunks.length)
      
      setCards(() => newCards)
      setSets(() => newSets)
      setMetadata(() => newMetadata)
      
      
      onProgress?.(100, 100, 'Database saved successfully!')
      
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

import { useKV } from '@github/spark/hooks'

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

const GITHUB_API_BASE = 'https://api.github.com/repos/PokemonTCG/pokemon-tcg-data/contents'
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'

async function fetchGitHubDirectory(path: string): Promise<Array<{ name: string; path: string; download_url: string }>> {
  const response = await fetch(`${GITHUB_API_BASE}/${path}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
    },
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('GitHub API Error:', response.status, errorText)
    throw new Error(`Failed to fetch directory (${response.status}): ${response.statusText}`)
  }
  return response.json()
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Fetch Error:', response.status, errorText)
    throw new Error(`Failed to fetch JSON (${response.status}): ${response.statusText}`)
  }
  return response.json()
}

export async function downloadCardDatabase(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ cards: TCGCard[]; sets: TCGSet[] }> {
  try {
    onProgress?.(0, 100, 'Fetching set list...')

    let setsFiles: Array<{ name: string; path: string; download_url: string }>
    try {
      setsFiles = await fetchGitHubDirectory('sets/en')
    } catch (error) {
      console.error('Error fetching sets directory:', error)
      throw new Error('Unable to access card database. Please check your internet connection.')
    }

    const setJsonFiles = setsFiles.filter(f => f.name.endsWith('.json'))
    onProgress?.(10, 100, `Found ${setJsonFiles.length} sets`)

    const sets: TCGSet[] = []
    for (let i = 0; i < setJsonFiles.length; i++) {
      try {
        const setData = await fetchJSON<TCGSet>(setJsonFiles[i].download_url)
        sets.push(setData)
        onProgress?.(10 + (i / setJsonFiles.length) * 10, 100, `Loading set ${i + 1}/${setJsonFiles.length}`)
      } catch (error) {
        console.error(`Failed to load set ${setJsonFiles[i].name}:`, error)
      }
    }

    onProgress?.(20, 100, 'Fetching card data...')

    let cardsDir: Array<{ name: string; path: string; download_url: string }>
    try {
      cardsDir = await fetchGitHubDirectory('cards/en')
    } catch (error) {
      console.error('Error fetching cards directory:', error)
      throw new Error('Unable to access card database. Please check your internet connection.')
    }

    const cardFiles = cardsDir.filter(f => f.name.endsWith('.json'))
    onProgress?.(30, 100, `Found ${cardFiles.length} card files`)

    const allCards: TCGCard[] = []
    let successCount = 0
    let failCount = 0
    
    for (let i = 0; i < cardFiles.length; i++) {
      try {
        const cardsData = await fetchJSON<TCGCard[]>(cardFiles[i].download_url)
        allCards.push(...cardsData)
        successCount++
        const progress = 30 + (i / cardFiles.length) * 60
        onProgress?.(progress, 100, `Loading cards ${i + 1}/${cardFiles.length} (${allCards.length} cards)`)
      } catch (error) {
        failCount++
        console.error(`Failed to load cards from ${cardFiles[i].name}:`, error)
      }
    }

    onProgress?.(90, 100, 'Processing data...')

    if (allCards.length === 0) {
      throw new Error('No cards were loaded. Please try again.')
    }

    console.log(`Database download complete: ${allCards.length} cards, ${sets.length} sets`)
    console.log(`Success: ${successCount}, Failed: ${failCount}`)

    return { cards: allCards, sets }
  } catch (error) {
    console.error('Failed to download card database:', error)
    throw error
  }
}

export function useTCGDatabase() {
  const [cards, setCards] = useKV<TCGCard[]>('tcg-database-cards', [])
  const [sets, setSets] = useKV<TCGSet[]>('tcg-database-sets', [])
  const [metadata, setMetadata] = useKV<DatabaseMetadata | null>('tcg-database-metadata', null)

  const updateDatabase = async (onProgress?: (current: number, total: number, message: string) => void) => {
    try {
      const { cards: newCards, sets: newSets } = await downloadCardDatabase(onProgress)
      
      setCards(newCards)
      setSets(newSets)
      setMetadata({
        lastUpdated: Date.now(),
        cardCount: newCards.length,
        setCount: newSets.length
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

  return {
    cards,
    sets,
    metadata,
    isLoaded: metadata !== null && (cards?.length ?? 0) > 0,
    updateDatabase,
    searchCards,
    findCard
  }
}

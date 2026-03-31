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

async function unzipAndExtractJSON(onProgress?: (current: number, total: number, message: string) => void): Promise<{ cards: TCGCard[]; sets: TCGSet[] }> {
  const { default: JSZip } = await import('jszip')
  const { Octokit } = await import('octokit')
  
  onProgress?.(5, 100, 'Fetching latest release info...')
  
  const octokit = new Octokit()
  
  let releaseData
  try {
    const response = await octokit.rest.repos.getLatestRelease({
      owner: 'PokemonTCG',
      repo: 'pokemon-tcg-data'
    })
    releaseData = response.data
  } catch (error) {
    console.error('Failed to fetch release:', error)
    throw new Error(`Failed to fetch release info: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  console.log('Release info:', { tag: releaseData.tag_name, tarball: releaseData.tarball_url })
  
  const tarballUrl = releaseData.tarball_url
  
  if (!tarballUrl) {
    throw new Error('No tarball URL found in release data')
  }
  
  onProgress?.(15, 100, 'Downloading card database (this may take a minute)...')
  
  let zipResponse
  try {
    zipResponse = await fetch(tarballUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/gzip, application/x-gzip, application/octet-stream, */*'
      }
    })
  } catch (fetchError) {
    console.error('Fetch error:', fetchError)
    throw new Error(`Network error while downloading: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`)
  }
  
  if (!zipResponse.ok) {
    const errorText = await zipResponse.text().catch(() => 'No error details available')
    console.error('Response not OK:', zipResponse.status, zipResponse.statusText, errorText)
    throw new Error(`Download failed: ${zipResponse.status} ${zipResponse.statusText}. Details: ${errorText}`)
  }
  
  onProgress?.(40, 100, 'Reading downloaded data...')
  
  const arrayBuffer = await zipResponse.arrayBuffer()
  
  onProgress?.(50, 100, 'Extracting archive...')
  
  const zip = await JSZip.loadAsync(arrayBuffer)
  
  const cards: TCGCard[] = []
  const sets: TCGSet[] = []
  
  const files = Object.keys(zip.files).filter(name => name.endsWith('.json'))
  onProgress?.(50, 100, `Found ${files.length} JSON files`)
  
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i]
    const file = zip.files[fileName]
    
    if (file.dir) continue
    
    try {
      const content = await file.async('text')
      const data = JSON.parse(content)
      
      if (fileName.includes('/sets/') || fileName.includes('\\sets\\')) {
        if (Array.isArray(data)) {
          sets.push(...data)
        } else {
          sets.push(data)
        }
      } else if (fileName.includes('/cards/') || fileName.includes('\\cards\\')) {
        if (Array.isArray(data)) {
          cards.push(...data)
        } else {
          cards.push(data)
        }
      }
      
      const progress = 50 + ((i + 1) / files.length) * 45
      onProgress?.(progress, 100, `Processing files... ${i + 1}/${files.length}`)
    } catch (error) {
      console.error(`Failed to parse ${fileName}:`, error)
    }
  }
  
  return { cards, sets }
}

export async function downloadCardDatabase(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ cards: TCGCard[]; sets: TCGSet[] }> {
  try {
    onProgress?.(0, 100, 'Preparing to download...')
    
    const { cards, sets } = await unzipAndExtractJSON(onProgress)
    
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

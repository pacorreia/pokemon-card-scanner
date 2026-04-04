import { useState, useEffect } from 'react'
import * as db from './indexeddb'

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
  key: string
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
  
  const DOWNLOAD_PARALLEL_LIMIT = 15
  
  onProgress?.(25, 100, `Downloading ${setsList.length} set files in parallel...`)
  
  const downloadFileBatch = async <T>(
    fileList: string[],
    baseUrl: string,
    validator: (item: any) => boolean,
    type: 'sets' | 'cards'
  ): Promise<T[]> => {
    const results: T[] = []
    
    const downloadBatch = async (startIndex: number, batchSize: number): Promise<void> => {
      const endIndex = Math.min(startIndex + batchSize, fileList.length)
      const batchPromises: Promise<void>[] = []
      
      for (let i = startIndex; i < endIndex; i++) {
        const file = fileList[i]
        const downloadPromise = (async () => {
          try {
            const url = `${baseUrl}/${file}`
            const response = await fetch(url)
            
            if (response.ok) {
              const data = await response.json()
              if (Array.isArray(data)) {
                const validItems = data.filter(validator)
                results.push(...validItems)
              } else if (validator(data)) {
                results.push(data)
              }
            }
          } catch (error) {
            console.error(`Failed to fetch ${type} file ${file}:`, error)
          }
          
          processedFiles++
          const progress = 25 + (processedFiles / totalFiles) * 70
          onProgress?.(progress, 100, `Downloaded ${processedFiles}/${totalFiles} files...`)
        })()
        
        batchPromises.push(downloadPromise)
      }
      
      await Promise.all(batchPromises)
    }
    
    for (let batchStart = 0; batchStart < fileList.length; batchStart += DOWNLOAD_PARALLEL_LIMIT) {
      await downloadBatch(batchStart, DOWNLOAD_PARALLEL_LIMIT)
    }
    
    return results
  }
  
  const setValidator = (item: any) => item && typeof item === 'object' && item.id && item.name
  const downloadedSets = await downloadFileBatch<TCGSet>(
    setsList,
    setsBaseUrl,
    setValidator,
    'sets'
  )
  sets.push(...downloadedSets)
  
  console.log(`Successfully downloaded ${sets.length} sets`)
  
  onProgress?.(50, 100, `Downloading ${cardsList.length} card files in parallel...`)
  
  const cardValidator = (item: any) => item && typeof item === 'object' && item.id && item.name
  const downloadedCards = await downloadFileBatch<TCGCard>(
    cardsList,
    cardsBaseUrl,
    cardValidator,
    'cards'
  )
  cards.push(...downloadedCards)
  
  console.log(`Successfully downloaded ${cards.length} cards`)
  
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

// ---------------------------------------------------------------------------
// Module-level shared state – all hook instances share the same data so that
// a database update in one component is immediately visible in every other.
// ---------------------------------------------------------------------------
let _metadata: DatabaseMetadata | null = null
let _sets: TCGSet[] = []
let _isLoading = true
let _initialized = false
let _initPromise: Promise<void> | null = null

const _listeners = new Set<() => void>()

function _notifyListeners() {
  _listeners.forEach(fn => fn())
}

function _initializeIfNeeded(): Promise<void> {
  if (_initialized) return Promise.resolve()
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      console.log('[TCG Database] Loading data from IndexedDB...')
      await db.openDB()

      const meta = await db.get<DatabaseMetadata>('metadata', 'database-metadata')
      const cardCount = await db.count('cards')
      const setCount = await db.count('sets')

      console.log('[TCG Database] IndexedDB state:', { meta, cardCount, setCount })

      if (setCount > 0) {
        _sets = await db.getAll<TCGSet>('sets')
        console.log(`[TCG Database] Loaded ${_sets.length} sets`)
      }

      if (meta && cardCount > 0) {
        const correctedMeta: DatabaseMetadata = { ...meta, cardCount, setCount }
        _metadata = correctedMeta

        if (meta.setCount !== setCount || meta.cardCount !== cardCount) {
          console.log('[TCG Database] Correcting metadata counts:', {
            oldCardCount: meta.cardCount,
            newCardCount: cardCount,
            oldSetCount: meta.setCount,
            newSetCount: setCount,
          })
          await db.put('metadata', correctedMeta)
        }

        console.log('[TCG Database] Metadata loaded, cards will load on demand')
      } else {
        _metadata = null
        _sets = []
        console.log('[TCG Database] No database found')
      }
      // Initialization completed successfully — allow future calls to short-circuit
      _initialized = true
    } catch (error) {
      console.error('[TCG Database] Failed to load from IndexedDB:', error)
      _metadata = null
      _sets = []
      // Clear the promise so transient errors allow a retry on next mount
      _initPromise = null
    } finally {
      _isLoading = false
      _notifyListeners()
    }
  })()

  return _initPromise
}

export function useTCGDatabase() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const listener = () => forceUpdate(n => n + 1)
    _listeners.add(listener)
    _initializeIfNeeded()
    return () => {
      _listeners.delete(listener)
    }
  }, [])

  const updateDatabase = async (onProgress?: (current: number, total: number, message: string) => void) => {
    try {
      const { cards: newCards, sets: newSets } = await downloadCardDatabase(onProgress)
      
      console.log('[TCG Database] Downloaded data:', {
        cardsCount: newCards.length,
        setsCount: newSets.length
      })
      
      onProgress?.(95, 100, 'Clearing old database...')
      
      await db.clearStore('cards')
      await db.clearStore('sets')
      await db.clearStore('metadata')
      
      console.log('[TCG Database] ✓ Old database cleared')
      
      onProgress?.(96, 100, 'Saving cards to database...')
      
      const cleanCards = newCards.map(card => {
        const cleaned: any = {
          id: card.id || '',
          name: card.name || '',
          supertype: card.supertype || '',
          subtypes: Array.isArray(card.subtypes) ? card.subtypes : [],
          hp: card.hp || undefined,
          types: Array.isArray(card.types) ? card.types : [],
          evolvesFrom: card.evolvesFrom || undefined,
          number: card.number || '',
          artist: card.artist || undefined,
          rarity: card.rarity || undefined,
          flavorText: card.flavorText || undefined,
          nationalPokedexNumbers: Array.isArray(card.nationalPokedexNumbers) ? card.nationalPokedexNumbers : [],
          legalities: {
            unlimited: card.legalities?.unlimited || undefined,
            standard: card.legalities?.standard || undefined,
            expanded: card.legalities?.expanded || undefined,
          },
          images: {
            small: card.images?.small || '',
            large: card.images?.large || '',
          }
        }
        
        if (card.abilities && Array.isArray(card.abilities)) {
          cleaned.abilities = card.abilities.map((a: any) => ({
            name: a.name || '',
            text: a.text || '',
            type: a.type || ''
          }))
        }
        
        if (card.attacks && Array.isArray(card.attacks)) {
          cleaned.attacks = card.attacks.map((a: any) => ({
            name: a.name || '',
            cost: Array.isArray(a.cost) ? a.cost : [],
            convertedEnergyCost: a.convertedEnergyCost || 0,
            damage: a.damage || '',
            text: a.text || ''
          }))
        }
        
        if (card.weaknesses && Array.isArray(card.weaknesses)) {
          cleaned.weaknesses = card.weaknesses.map((w: any) => ({
            type: w.type || '',
            value: w.value || ''
          }))
        }
        
        if (card.resistances && Array.isArray(card.resistances)) {
          cleaned.resistances = card.resistances.map((r: any) => ({
            type: r.type || '',
            value: r.value || ''
          }))
        }
        
        if (card.retreatCost && Array.isArray(card.retreatCost)) {
          cleaned.retreatCost = card.retreatCost
          cleaned.convertedRetreatCost = card.convertedRetreatCost || card.retreatCost.length
        }
        
        if (card.set && typeof card.set === 'object') {
          cleaned.set = {
            id: card.set.id || '',
            name: card.set.name || '',
            series: card.set.series || '',
            printedTotal: card.set.printedTotal || 0,
            total: card.set.total || 0,
            legalities: {
              unlimited: card.set.legalities?.unlimited || undefined,
              standard: card.set.legalities?.standard || undefined,
              expanded: card.set.legalities?.expanded || undefined,
            },
            releaseDate: card.set.releaseDate || '',
            updatedAt: card.set.updatedAt || '',
            images: {
              symbol: card.set.images?.symbol || '',
              logo: card.set.images?.logo || ''
            }
          }
          if (card.set.ptcgoCode) {
            cleaned.set.ptcgoCode = card.set.ptcgoCode
          }
        }
        
        if (card.tcgplayer && typeof card.tcgplayer === 'object') {
          cleaned.tcgplayer = {
            url: card.tcgplayer.url || '',
            updatedAt: card.tcgplayer.updatedAt || '',
            prices: card.tcgplayer.prices || undefined
          }
        }
        
        if (card.cardmarket && typeof card.cardmarket === 'object') {
          cleaned.cardmarket = {
            url: card.cardmarket.url || '',
            updatedAt: card.cardmarket.updatedAt || '',
            prices: card.cardmarket.prices || undefined
          }
        }
        
        return cleaned as TCGCard
      })
      
      const cleanSets = newSets.map(set => ({
        id: set.id || '',
        name: set.name || '',
        series: set.series || '',
        printedTotal: set.printedTotal || 0,
        total: set.total || 0,
        legalities: set.legalities || {},
        releaseDate: set.releaseDate || '',
        updatedAt: set.updatedAt || '',
        images: set.images || { symbol: '', logo: '' },
        ...(set.ptcgoCode && { ptcgoCode: set.ptcgoCode })
      }))
      
      console.log(`[TCG Database] Saving ${cleanCards.length} cards in batches...`)
      
      const BATCH_SIZE = 500
      const startTime = Date.now()
      
      for (let i = 0; i < cleanCards.length; i += BATCH_SIZE) {
        const batch = cleanCards.slice(i, i + BATCH_SIZE)
        await db.bulkPut('cards', batch)
        
        const progress = 96 + ((i + batch.length) / cleanCards.length) * 3
        const elapsed = Date.now() - startTime
        const rate = (i + batch.length) / (elapsed / 1000)
        const remaining = cleanCards.length - (i + batch.length)
        const estimatedSecondsRemaining = Math.ceil(remaining / rate)
        
        let timeMessage = ''
        if (estimatedSecondsRemaining < 60) {
          timeMessage = ` • ~${estimatedSecondsRemaining}s remaining`
        } else {
          const minutes = Math.floor(estimatedSecondsRemaining / 60)
          const seconds = estimatedSecondsRemaining % 60
          timeMessage = ` • ~${minutes}m ${seconds}s remaining`
        }
        
        onProgress?.(progress, 100, `Saved ${i + batch.length}/${cleanCards.length} cards${timeMessage}`)
        console.log(`[TCG Database] ✓ Saved ${i + batch.length}/${cleanCards.length} cards`)
      }
      
      console.log(`[TCG Database] ✓ All cards saved (${((Date.now() - startTime) / 1000).toFixed(1)}s)`)
      
      onProgress?.(99, 100, `Saving ${cleanSets.length} sets...`)
      
      await db.bulkPut('sets', cleanSets)
      console.log(`[TCG Database] ✓ All sets saved`)
      
      onProgress?.(99.5, 100, 'Saving metadata...')
      
      const newMetadata: DatabaseMetadata = {
        key: 'database-metadata',
        lastUpdated: Date.now(),
        cardCount: cleanCards.length,
        setCount: cleanSets.length
      }
      
      await db.put('metadata', newMetadata)
      console.log(`[TCG Database] ✓ Metadata saved`)

      // Update shared module state and notify all hook instances
      _metadata = newMetadata
      _sets = cleanSets
      _isLoading = false
      _notifyListeners()

      onProgress?.(100, 100, 'Database saved successfully!')

      return { success: true }
    } catch (error) {
      console.error('Database update failed:', error)

      try {
        await db.clearStore('cards')
        await db.clearStore('sets')
        await db.clearStore('metadata')
        console.log('[TCG Database] ✓ Rolled back database changes')
      } catch (rollbackError) {
        console.error('[TCG Database] ✗ Rollback failed:', rollbackError)
      }

      // Ensure in-memory state reflects that no database is currently loaded
      _metadata = null
      _sets = []
      _isLoading = false
      _notifyListeners()

      return { success: false, error }
    }
  }

  const isLoaded = !_isLoading && _metadata !== null && (_metadata?.cardCount ?? 0) > 0

  return {
    // Cards are loaded on-demand via getAllCards(); this property exists for
    // API compatibility but is intentionally empty (use getAllCards() instead).
    cards: [],
    sets: _sets,
    metadata: _metadata,
    isLoaded,
    isLoading: _isLoading,
    updateDatabase,
    searchCards,
    findCard,
    getAllCards,
  }
}

// ---------------------------------------------------------------------------
// Stable module-level query helpers – these functions only reference
// module-level state so their identity never changes between renders,
// preventing unnecessary useEffect re-runs in consuming components.
// ---------------------------------------------------------------------------

export async function searchCards(query: string, limit = 10): Promise<TCGCard[]> {
  await _initializeIfNeeded()
  const lowerQuery = query.toLowerCase()

  const allCards = await db.getAll<TCGCard>('cards')

  const results = allCards.filter(card => {
    return (
      card.name.toLowerCase().includes(lowerQuery) ||
      card.set.name.toLowerCase().includes(lowerQuery) ||
      card.number.includes(query)
    )
  })

  return results.slice(0, limit)
}

export async function findCard(name: string, setName?: string, cardNumber?: string): Promise<TCGCard | null> {
  try {
    console.log('[TCG Database] findCard called:', { name, setName, cardNumber })

    await _initializeIfNeeded()

    if (!_metadata || _metadata.cardCount === 0) {
      console.warn('[TCG Database] No database loaded, cannot find card')
      return null
    }

    const lowerName = name.toLowerCase()

    const allCards = await db.getAll<TCGCard>('cards')
    console.log(`[TCG Database] Loaded ${allCards.length} cards from IndexedDB`)

    if (allCards.length === 0) {
      console.warn('[TCG Database] No cards found in IndexedDB despite metadata existing')
      return null
    }

    const exactMatches = allCards.filter(card =>
      card.name.toLowerCase() === lowerName
    )

    console.log(`[TCG Database] Found ${exactMatches.length} exact matches for "${name}"`)

    let partialMatches: TCGCard[] = []
    if (exactMatches.length === 0) {
      partialMatches = allCards.filter(card => {
        const cardNameLower = card.name.toLowerCase()
        return cardNameLower.includes(lowerName) || lowerName.includes(cardNameLower)
      })
      console.log(`[TCG Database] Found ${partialMatches.length} partial matches for "${name}"`)
    }

    let matches = exactMatches.length > 0 ? exactMatches : partialMatches

    if (setName && matches.length > 1) {
      const lowerSet = setName.toLowerCase()
      const setFiltered = matches.filter(card =>
        card.set.name.toLowerCase().includes(lowerSet) ||
        card.set.series.toLowerCase().includes(lowerSet)
      )
      if (setFiltered.length > 0) {
        console.log(`[TCG Database] Filtered by set "${setName}": ${setFiltered.length} matches`)
        matches = setFiltered
      }
    }

    if (cardNumber && matches.length > 1) {
      const numberPart = cardNumber.split('/')[0]
      const numberFiltered = matches.filter(card =>
        card.number === numberPart || card.number === cardNumber
      )
      if (numberFiltered.length > 0) {
        console.log(`[TCG Database] Filtered by card number "${cardNumber}": ${numberFiltered.length} matches`)
        matches = numberFiltered
      }
    }

    const result = matches[0] || null
    console.log('[TCG Database] findCard result:', result ? `Found ${result.name}` : 'No match found')
    return result
  } catch (error) {
    console.error('[TCG Database] Error in findCard:', error)
    return null
  }
}

export async function getAllCards(): Promise<TCGCard[]> {
  await _initializeIfNeeded()
  return await db.getAll<TCGCard>('cards')
}

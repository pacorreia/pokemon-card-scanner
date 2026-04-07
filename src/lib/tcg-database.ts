/**
 * src/lib/tcg-database.ts
 *
 * Client-side facade over the server's SQLite-backed TCG API.
 * Keeps the same useTCGDatabase() hook interface so all existing components
 * (DatabaseManager, DatabaseBrowser, ScanDialog, App) continue to work
 * without modification.
 *
 * All heavy logic (card matching, download, storage) now lives in server/.
 */

import { useState, useEffect, useCallback } from 'react'
import { apiFetch, authHeaders } from './api-fetch'

// ── Re-exported types (used by DatabaseBrowser and other components) ────────

export interface TCGCard {
  id: string
  name: string
  supertype: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  evolvesFrom?: string
  abilities?: Array<{ name: string; text: string; type: string }>
  attacks?: Array<{
    name: string; cost: string[]; convertedEnergyCost: number; damage: string; text: string
  }>
  weaknesses?: Array<{ type: string; value: string }>
  resistances?: Array<{ type: string; value: string }>
  retreatCost?: string[]
  convertedRetreatCost?: number
  set: {
    id: string
    name: string
    series: string
    printedTotal: number
    total: number
    legalities: { unlimited?: string; standard?: string; expanded?: string }
    ptcgoCode?: string
    releaseDate: string
    updatedAt: string
    images: { symbol: string; logo: string }
  }
  number: string
  artist?: string
  rarity?: string
  flavorText?: string
  nationalPokedexNumbers?: number[]
  legalities: { unlimited?: string; standard?: string; expanded?: string }
  images: { small: string; large: string }
  tcgplayer?: { url: string; updatedAt: string; prices?: Record<string, unknown> }
  cardmarket?: { url: string; updatedAt: string; prices?: Record<string, unknown> }
}

export interface TCGSet {
  id: string
  name: string
  series: string
  printedTotal: number
  total: number
  legalities: { unlimited?: string; standard?: string; expanded?: string }
  ptcgoCode?: string
  releaseDate: string
  updatedAt: string
  images: { symbol: string; logo: string }
}

export interface DatabaseMetadata {
  cardCount: number
  setCount: number
  lastUpdated: number | null
}

// ── Module-level exports used directly by ScanDialog ────────────────────────

export async function findCard(
  name: string,
  setName?: string,
  cardNumber?: string,
): Promise<TCGCard | null> {
  try {
    const params = new URLSearchParams({ name: name ?? '' })
    if (setName)    params.set('set',    setName)
    if (cardNumber) params.set('number', cardNumber)
    return await apiFetch<TCGCard | null>(`/api/cards/find?${params}`)
  } catch (err) {
    console.error('[TCG] findCard error:', err)
    return null
  }
}

export async function getCardById(id: string): Promise<TCGCard | null> {
  try {
    return await apiFetch<TCGCard | null>(`/api/cards/${encodeURIComponent(id)}`)
  } catch (err) {
    console.error('[TCG] getCardById error:', err)
    return null
  }
}

export async function getAllCards(): Promise<TCGCard[]> {
  // Paginates through the server API in batches of 500 and returns at most
  // MAX_CARDS results. If the catalog exceeds this limit the result is
  // intentionally truncated; callers should prefer server-side filtered
  // queries (searchCards / /api/cards?setId=...) for larger datasets.
  const PAGE = 500
  const MAX_CARDS = 10_000
  const all: TCGCard[] = []
  let offset = 0
  for (;;) {
    const remaining = MAX_CARDS - all.length
    if (remaining <= 0) break

    const limit = Math.min(PAGE, remaining)
    const { cards, total } = await apiFetch<{ cards: TCGCard[]; total: number }>(
      `/api/cards?limit=${limit}&offset=${offset}`
    )
    all.push(...cards)
    offset += cards.length
    if (all.length >= MAX_CARDS || offset >= total || cards.length === 0) break
  }
  return all
}

export async function searchCards(query: string, limit = 10): Promise<TCGCard[]> {
  const { cards } = await apiFetch<{ cards: TCGCard[]; total: number }>(
    `/api/cards?q=${encodeURIComponent(query)}&limit=${limit}`
  )
  return cards
}

// ── useTCGDatabase hook ──────────────────────────────────────────────────────

export function useTCGDatabase() {
  const [metadata, setMetadata] = useState<DatabaseMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sets, setSets] = useState<TCGSet[]>([])

  // Load status & sets on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [status, fetchedSets] = await Promise.all([
          apiFetch<DatabaseMetadata | null>('/api/db/status'),
          apiFetch<TCGSet[]>('/api/sets'),
        ])
        if (cancelled) return
        setMetadata(status)
        setSets(fetchedSets ?? [])
      } catch {
        if (!cancelled) setMetadata(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const isLoaded = !isLoading && metadata !== null && (metadata?.cardCount ?? 0) > 0

  // Refresh the database status from the server
  const refreshStatus = useCallback(async () => {
    try {
      const status = await apiFetch<DatabaseMetadata | null>('/api/db/status')
      setMetadata(status)
    } catch (err) {
      console.error('[TCG] Failed to refresh status:', err)
    }
  }, [])

  // Triggers a server-side TCG data download and streams SSE progress events.
  const updateDatabase = useCallback(
    async (
      onProgress?: (current: number, total: number, message: string) => void,
    ): Promise<{ success: boolean; error?: unknown }> => {
      try {
        const startRes = await fetch('/api/db/download', { method: 'POST', headers: authHeaders() })
        if (!startRes.ok) throw new Error(await startRes.text())

        return await new Promise((resolve) => {
          const source = new EventSource('/api/db/progress')

          source.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              if (data.type === 'progress') {
                onProgress?.(data.current, data.total, data.message)
              } else if (data.type === 'done') {
                source.close()
                setMetadata({ cardCount: data.cardCount, setCount: data.setCount, lastUpdated: Date.now() })
                // Refresh sets after download
                apiFetch<TCGSet[]>('/api/sets').then(s => setSets(s ?? [])).catch(() => {})
                resolve({ success: true })
              } else if (data.type === 'error') {
                source.close()
                resolve({ success: false, error: new Error(data.message) })
              }
            } catch {
              // ignore parse errors
            }
          }

          source.onerror = () => {
            source.close()
            resolve({ success: false, error: new Error('SSE connection failed') })
          }
        })
      } catch (error) {
        return { success: false, error }
      }
    },
    [],
  )

  return {
    cards: [],      // kept for API compat; use getAllCards() for full list
    sets,
    metadata,
    isLoaded,
    isLoading,
    updateDatabase,
    refreshStatus,
    searchCards,
    findCard,
    getAllCards,
    getCardById,
  }
}

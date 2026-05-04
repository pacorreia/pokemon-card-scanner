import { apiFetch } from '@/lib/api-fetch'
import type { PokemonCard, CardCollection } from '@/lib/types'

export const api = {
  // -- Collection (user's scanned cards) ------------------------------------
  getCollection: ()                        => apiFetch<PokemonCard[]>('/api/collection'),
  addCard:       (card: PokemonCard)       => apiFetch<PokemonCard>('/api/collection', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card),
  }),
  updateCard: (id: string, patch: Partial<PokemonCard>) => {
    if (!id) return Promise.reject(new Error('Card ID is required'))
    return apiFetch<PokemonCard>(`/api/collection/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
  },
  deleteCard: (id: string) => apiFetch<{ ok: boolean }>(`/api/collection/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // -- Named collections (folders) ------------------------------------------
  getCollections:   ()                                   => apiFetch<CardCollection[]>('/api/collections'),
  createCollection: (c: CardCollection)                  => apiFetch<CardCollection>('/api/collections', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
  }),
  updateCollection: (id: string, patch: Partial<CardCollection>) => apiFetch<CardCollection>(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  }),
  deleteCollection: (id: string)                         => apiFetch<{ ok: boolean }>(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setMembership:    (collectionId: string, cardId: string, add: boolean) =>
    apiFetch<{ ok: boolean }>(`/api/collections/${encodeURIComponent(collectionId)}/cards`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId, add }),
    }),
}

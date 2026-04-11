/**
 * Client-side helpers for the server-side scan queue.
 *
 * Images are stored on the server as JPEG files and never kept in JS heap
 * longer than necessary for AI processing.
 */
import { apiFetch } from './api-fetch'
import type { ScannedCardDraft, ScanQueueItem } from './card-analysis'

type ServerQueueItem = Omit<ScanQueueItem, 'dataUrl'>

export const queueApi = {
  getAll: () => apiFetch<ServerQueueItem[]>('/api/scan-queue'),

  /** Upload a captured image, creates the queue entry on the server. */
  add: (id: string, dataUrl: string) =>
    apiFetch<{ id: string }>('/api/scan-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, dataUrl }),
    }),

  patch: (id: string, patch: { status?: string; error?: string | null; drafts?: ScannedCardDraft[] | null }) =>
    apiFetch<{ ok: boolean }>(`/api/scan-queue/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  remove: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/scan-queue/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  clearAll: () =>
    apiFetch<{ ok: boolean }>('/api/scan-queue', { method: 'DELETE' }),

  /**
   * Fetch the stored image as a data URL for AI analysis.
   * The dataUrl is only held transiently during processing.
   */
  fetchImageDataUrl: async (id: string): Promise<string> => {
    const res = await fetch(`/api/scan-queue/${encodeURIComponent(id)}/image`)
    if (!res.ok) throw new Error(`Queue image not found (${id})`)
    const blob = await res.blob()
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  },
}

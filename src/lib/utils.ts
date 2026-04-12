import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns true if `value` is a non-placeholder, loadable image URL. */
export function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const n = value.trim()
  if (!n || n === 'undefined' || n === 'null') return false
  if (n.includes('placehold.co')) return false
  return n.startsWith('https://') || n.startsWith('http://') || n.startsWith('data:image/')
}

/** Picks the first usable image URL from `candidates`. */
export function pickBestImageUrl(...candidates: Array<unknown>): string {
  for (const c of candidates) { if (isUsableImageUrl(c)) return c }
  return ''
}

/** Formats estimated collection value as a human-readable string.
 *  Returns null when neither price is available. */
export function formatEstimatedValue(usd: number, eur: number): string | null {
  if (usd <= 0 && eur <= 0) return null
  const parts: string[] = []
  if (usd > 0) parts.push(`$${usd.toFixed(2)}`)
  if (eur > 0) parts.push(`€${eur.toFixed(2)}`)
  return `Est. value: ${parts.join(' / ')}`
}

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

/**
 * tests/src/lib/image-processing.test.ts
 *
 * Integration tests for src/lib/image-processing.ts using real card-sized JPEG
 * images from tests/assets/cards/.  The canvas polyfill (tests/setup/) lets the
 * browser-Canvas functions run in Node.js under Vitest.
 *
 * Asset images:
 *   sharp.jpg  — fine checkerboard → high Laplacian variance → not blurry
 *   blurry.jpg — flat gradient     → near-zero variance     → blurry
 *   glare.jpg  — overexposed area  → >10% near-white pixels → has glare
 *
 * To replace the synthetic placeholders with real TCG card images run:
 *   node scripts/download-test-cards.mjs
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assessImageQuality,
  enhanceCardImage,
  extractCardBottomCrop,
  imageDataUrlHash,
} from '@/lib/image-processing'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '../../assets/cards')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadAsDataUrl(filename: string): Promise<string> {
  const buf = await readFile(path.join(ASSETS, filename))
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

// ── imageDataUrlHash ──────────────────────────────────────────────────────────

describe('imageDataUrlHash', () => {
  let sharpDataUrl: string
  let blurryDataUrl: string

  beforeAll(async () => {
    sharpDataUrl = await loadAsDataUrl('sharp.jpg')
    blurryDataUrl = await loadAsDataUrl('blurry.jpg')
  })

  it('returns a non-empty string', () => {
    expect(imageDataUrlHash(sharpDataUrl)).toBeTruthy()
  })

  it('is deterministic — same input always gives same hash', () => {
    expect(imageDataUrlHash(sharpDataUrl)).toBe(imageDataUrlHash(sharpDataUrl))
  })

  it('returns different hashes for different images', () => {
    expect(imageDataUrlHash(sharpDataUrl)).not.toBe(imageDataUrlHash(blurryDataUrl))
  })

  it('handles a short data URL (≤ 2000 chars) without truncation', () => {
    const short = 'data:image/jpeg;base64,' + 'A'.repeat(100)
    const hash = imageDataUrlHash(short)
    expect(hash).toBeTruthy()
    expect(imageDataUrlHash(short)).toBe(hash) // deterministic
  })

  it('handles a long data URL (> 2000 chars) by sampling', () => {
    const long = 'data:image/jpeg;base64,' + 'B'.repeat(3000)
    const hash = imageDataUrlHash(long)
    expect(hash).toBeTruthy()
    expect(imageDataUrlHash(long)).toBe(hash) // deterministic
  })

  it('a single-character difference in the data URL changes the hash', () => {
    const base = 'data:image/jpeg;base64,' + 'C'.repeat(50)
    const modified = base.slice(0, -1) + 'D'
    expect(imageDataUrlHash(base)).not.toBe(imageDataUrlHash(modified))
  })
})

// ── assessImageQuality ────────────────────────────────────────────────────────

describe('assessImageQuality', () => {
  it('rates the sharp card as not blurry', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.isBlurry).toBe(false)
    expect(report.blurScore).toBeGreaterThan(0)
  })

  it('rates the blurry card as blurry', async () => {
    const dataUrl = await loadAsDataUrl('blurry.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.isBlurry).toBe(true)
  })

  it('rates the glare card as having glare', async () => {
    const dataUrl = await loadAsDataUrl('glare.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.hasGlare).toBe(true)
    expect(report.glareScore).toBeGreaterThan(0.1)
  })

  it('marks the sharp card as not needing enhancement', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.needsEnhancement).toBe(false)
  })

  it('marks the blurry card as needing enhancement', async () => {
    const dataUrl = await loadAsDataUrl('blurry.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.needsEnhancement).toBe(true)
  })

  it('includes a suggestion for the blurry card', async () => {
    const dataUrl = await loadAsDataUrl('blurry.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.suggestion).toBeTruthy()
    expect(report.suggestion).toContain('blurry')
  })

  it('includes a suggestion for the glare card', async () => {
    const dataUrl = await loadAsDataUrl('glare.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.suggestion).toBeTruthy()
  })

  it('returns no suggestion for the sharp card', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const report = await assessImageQuality(dataUrl)
    expect(report.suggestion).toBeUndefined()
  })

  it('returns a safe fallback report for an invalid data URL', async () => {
    const report = await assessImageQuality('data:image/jpeg;base64,not-valid-base64!!!')
    // Should not throw; returns a neutral fallback
    expect(report).toHaveProperty('isBlurry')
    expect(report).toHaveProperty('hasGlare')
    expect(report).toHaveProperty('needsEnhancement')
  })
})

// ── enhanceCardImage ──────────────────────────────────────────────────────────

describe('enhanceCardImage', () => {
  it('returns a JPEG data URL for a blurry card', async () => {
    const dataUrl = await loadAsDataUrl('blurry.jpg')
    const report = await assessImageQuality(dataUrl)
    const enhanced = await enhanceCardImage(dataUrl, report)
    expect(enhanced).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('returns a JPEG data URL for a glare card', async () => {
    const dataUrl = await loadAsDataUrl('glare.jpg')
    const report = await assessImageQuality(dataUrl)
    const enhanced = await enhanceCardImage(dataUrl, report)
    expect(enhanced).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('produces a different data URL after enhancement (image was changed)', async () => {
    const dataUrl = await loadAsDataUrl('blurry.jpg')
    const report = await assessImageQuality(dataUrl)
    const enhanced = await enhanceCardImage(dataUrl, report)
    // Enhancement must have altered the image content
    expect(imageDataUrlHash(enhanced)).not.toBe(imageDataUrlHash(dataUrl))
  })

  it('returns the original data URL on invalid input instead of throwing', async () => {
    const invalid = 'data:image/jpeg;base64,!!!invalid'
    const fakeReport = { isBlurry: true, hasGlare: false, blurScore: 0, glareScore: 0, needsEnhancement: true }
    const result = await enhanceCardImage(invalid, fakeReport)
    expect(result).toBe(invalid)
  })
})

// ── extractCardBottomCrop ─────────────────────────────────────────────────────

describe('extractCardBottomCrop', () => {
  it('returns a JPEG data URL', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const crop = await extractCardBottomCrop(dataUrl)
    expect(crop).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('returns a URL different from the original (crop was made)', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const crop = await extractCardBottomCrop(dataUrl)
    expect(crop).not.toBe(dataUrl)
  })

  it('crop content differs from the full image content', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const crop = await extractCardBottomCrop(dataUrl)
    expect(imageDataUrlHash(crop)).not.toBe(imageDataUrlHash(dataUrl))
  })

  it('works with different fromPercent values', async () => {
    const dataUrl = await loadAsDataUrl('sharp.jpg')
    const crop10 = await extractCardBottomCrop(dataUrl, 0.10)
    const crop30 = await extractCardBottomCrop(dataUrl, 0.30)
    // Different crop sizes → different content
    expect(imageDataUrlHash(crop10)).not.toBe(imageDataUrlHash(crop30))
  })

  it('returns the original on an invalid data URL instead of throwing', async () => {
    const invalid = 'data:image/jpeg;base64,!!!'
    const result = await extractCardBottomCrop(invalid)
    expect(result).toBe(invalid)
  })
})

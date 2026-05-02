#!/usr/bin/env node
/**
 * scripts/generate-test-card-images.mjs
 *
 * Generates synthetic Pokémon-card-sized JPEG images into tests/assets/cards/.
 * These cover three quality conditions that the image-processing pipeline handles:
 *
 *   sharp.jpg  — high-frequency edge content → Laplacian variance is high → "not blurry"
 *   blurry.jpg — uniform flat fill → near-zero Laplacian variance → "blurry"
 *   glare.jpg  — mostly near-white pixels → glare fraction > 10% → "has glare"
 *
 * Run:  node scripts/generate-test-card-images.mjs
 *
 * The generated files are committed to the repo so tests run offline.
 * Replace them with real TCG card images using scripts/download-test-cards.mjs
 * when network access is available.
 */

import { createCanvas } from 'canvas'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../tests/assets/cards')

// Standard Pokémon card ratio ≈ 2.5 × 3.5 inches → 250 × 350 px at 100 dpi
const CARD_W = 250
const CARD_H = 350

await mkdir(OUT_DIR, { recursive: true })

// ── sharp.jpg ─────────────────────────────────────────────────────────────────
// A fine checkerboard pattern creates many sharp edges → high Laplacian variance.
{
  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext('2d')
  const tileSize = 4
  for (let y = 0; y < CARD_H; y += tileSize) {
    for (let x = 0; x < CARD_W; x += tileSize) {
      ctx.fillStyle = ((x / tileSize + y / tileSize) % 2 === 0) ? '#1a1a2e' : '#e8e8f0'
      ctx.fillRect(x, y, tileSize, tileSize)
    }
  }
  // Add a card-name-style band at the top and a number at the bottom
  ctx.fillStyle = '#2e4057'
  ctx.fillRect(0, 0, CARD_W, 40)
  ctx.fillStyle = '#f0e68c'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText('Charizard', 10, 27)
  ctx.fillStyle = '#2e4057'
  ctx.fillRect(0, CARD_H - 30, CARD_W, 30)
  ctx.fillStyle = '#ffffff'
  ctx.font = '12px sans-serif'
  ctx.fillText('4/102', 10, CARD_H - 10)
  await writeFile(path.join(OUT_DIR, 'sharp.jpg'), canvas.toBuffer('image/jpeg', { quality: 0.92 }))
  console.log('✓ sharp.jpg')
}

// ── blurry.jpg ────────────────────────────────────────────────────────────────
// A flat, near-uniform gradient has almost no edges → very low Laplacian variance.
{
  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  gradient.addColorStop(0, '#b0b8d0')
  gradient.addColorStop(1, '#c8cfe8')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // Very faint text — keeps the image visually card-like but adds minimal edges
  ctx.fillStyle = 'rgba(100,110,140,0.3)'
  ctx.font = '14px sans-serif'
  ctx.fillText('Blastoise', 10, 25)
  ctx.fillText('2/102', 10, CARD_H - 10)
  await writeFile(path.join(OUT_DIR, 'blurry.jpg'), canvas.toBuffer('image/jpeg', { quality: 0.92 }))
  console.log('✓ blurry.jpg')
}

// ── glare.jpg ─────────────────────────────────────────────────────────────────
// >15% of pixels are near-white (RGB > 240) → glare fraction exceeds 10% threshold.
{
  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext('2d')
  // Background: a typical card colour
  ctx.fillStyle = '#5ba4cf'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // Overexposed glare ellipse covering ~50% of the card area
  const grd = ctx.createRadialGradient(CARD_W / 2, CARD_H / 3, 20, CARD_W / 2, CARD_H / 3, 130)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.5, 'rgba(255,255,255,0.95)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = '#1a2a3a'
  ctx.font = '12px sans-serif'
  ctx.fillText('Venusaur', 10, CARD_H - 10)
  await writeFile(path.join(OUT_DIR, 'glare.jpg'), canvas.toBuffer('image/jpeg', { quality: 0.92 }))
  console.log('✓ glare.jpg')
}

console.log(`\nGenerated 3 test card images in ${OUT_DIR}`)
console.log('To replace with real TCG card images, run:  node scripts/download-test-cards.mjs')

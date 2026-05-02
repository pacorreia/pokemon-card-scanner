#!/usr/bin/env node
/**
 * scripts/download-test-cards.mjs
 *
 * Downloads real Pokémon card images from the Pokémon TCG API and saves them
 * to tests/assets/cards/, overwriting the synthetic placeholder images.
 *
 * Run once (requires network access):
 *   node scripts/download-test-cards.mjs
 *
 * The downloaded images are then committed so subsequent CI runs stay offline.
 * An API key is not required for the free tier (100 req/day without key).
 */

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../tests/assets/cards')

// Three cards chosen to cover different visual characteristics:
//   base1-4  Charizard — iconic, richly coloured artwork
//   base1-2  Blastoise — cooler tones
//   base1-15 Venusaur  — green tones
const CARDS = [
  { id: 'base1-4',  filename: 'sharp.jpg',  description: 'Charizard (Base Set 4/102)' },
  { id: 'base1-2',  filename: 'blurry.jpg', description: 'Blastoise (Base Set 2/102)' },
  { id: 'base1-15', filename: 'glare.jpg',  description: 'Venusaur (Base Set 15/102)' },
]

await mkdir(OUT_DIR, { recursive: true })

for (const { id, filename, description } of CARDS) {
  process.stdout.write(`Fetching ${description}… `)
  try {
    // Resolve card metadata from the TCG API
    const metaRes = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`)
    if (!metaRes.ok) throw new Error(`TCG API ${metaRes.status}`)
    const { data } = await metaRes.json()
    const imageUrl = data.images?.large ?? data.images?.small
    if (!imageUrl) throw new Error('no image URL in response')

    // Download the card image
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`image download ${imgRes.status}`)
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    await writeFile(path.join(OUT_DIR, filename), buffer)
    console.log(`✓  saved to ${filename} (${buffer.length} bytes)`)
  } catch (err) {
    console.error(`✗  ${err.message} — keeping existing file`)
  }
}

console.log('\nDone. Commit tests/assets/cards/ to lock in the real images.')

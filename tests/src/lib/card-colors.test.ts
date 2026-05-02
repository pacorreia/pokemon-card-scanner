import { describe, it, expect } from 'vitest'
import { rarityColors, typeColors } from '@/lib/card-colors'

describe('rarityColors', () => {
  const expectedRarities = ['Common', 'Uncommon', 'Rare', 'Holo Rare', 'Ultra Rare', 'Secret Rare']

  it('has an entry for every canonical rarity', () => {
    for (const rarity of expectedRarities) {
      expect(rarityColors[rarity], `missing color for rarity "${rarity}"`).toBeTruthy()
    }
  })

  it('all values are Tailwind bg- class strings', () => {
    for (const [rarity, cls] of Object.entries(rarityColors)) {
      expect(cls, `invalid class for "${rarity}"`).toMatch(/^bg-[a-z]+-\d{3}$/)
    }
  })
})

describe('typeColors', () => {
  const expectedTypes = ['Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless']

  it('has an entry for every canonical type', () => {
    for (const type of expectedTypes) {
      expect(typeColors[type], `missing color for type "${type}"`).toBeTruthy()
    }
  })

  it('all values are Tailwind bg- class strings', () => {
    for (const [type, cls] of Object.entries(typeColors)) {
      expect(cls, `invalid class for "${type}"`).toMatch(/^bg-[a-z]+-\d{3}$/)
    }
  })
})

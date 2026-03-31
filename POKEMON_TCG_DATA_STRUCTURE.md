# Pokemon TCG Data Repository Structure

## Overview
The Pokemon TCG Data repository (https://github.com/PokemonTCG/pokemon-tcg-data) contains comprehensive JSON data for all Pokemon Trading Card Game cards, sets, and related information.

## Data Distribution Method

### GitHub Releases (Recommended)
The repository provides pre-packaged ZIP files through GitHub Releases containing all the data:
- **Latest Release API**: `https://api.github.com/repos/PokemonTCG/pokemon-tcg-data/releases/latest`
- **Assets**: Each release includes a ZIP file containing all cards and sets data
- **Benefits**: 
  - Single download instead of hundreds of individual API calls
  - Faster and more reliable
  - Respects GitHub API rate limits
  - Reduced server load

### Repository Structure
Inside the ZIP file (and in the repo), the structure is:
```
pokemon-tcg-data/
├── cards/
│   └── en/           # English cards
│       ├── base1.json
│       ├── base2.json
│       ├── base3.json
│       └── ... (one file per set)
└── sets/
    └── en/           # English sets
        ├── base1.json
        ├── base2.json
        ├── base3.json
        └── ... (one file per set)
```

## JSON File Structures

### Cards JSON Format
Each card file in `cards/en/` contains an array of card objects:

```json
[
  {
    "id": "base1-1",
    "name": "Alakazam",
    "supertype": "Pokémon",
    "subtypes": ["Stage 2"],
    "hp": "80",
    "types": ["Psychic"],
    "evolvesFrom": "Kadabra",
    "abilities": [
      {
        "name": "Damage Swap",
        "text": "As often as you like during your turn...",
        "type": "Pokémon Power"
      }
    ],
    "attacks": [
      {
        "name": "Confuse Ray",
        "cost": ["Psychic", "Psychic", "Psychic"],
        "convertedEnergyCost": 3,
        "damage": "30",
        "text": "Flip a coin..."
      }
    ],
    "weaknesses": [
      {
        "type": "Psychic",
        "value": "×2"
      }
    ],
    "retreatCost": ["Colorless", "Colorless", "Colorless"],
    "convertedRetreatCost": 3,
    "set": {
      "id": "base1",
      "name": "Base",
      "series": "Base",
      "printedTotal": 102,
      "total": 102,
      "legalities": {
        "unlimited": "Legal"
      },
      "releaseDate": "1999/01/09",
      "updatedAt": "2020/08/14 09:35:00",
      "images": {
        "symbol": "https://images.pokemontcg.io/base1/symbol.png",
        "logo": "https://images.pokemontcg.io/base1/logo.png"
      }
    },
    "number": "1",
    "artist": "Ken Sugimori",
    "rarity": "Rare Holo",
    "nationalPokedexNumbers": [65],
    "legalities": {
      "unlimited": "Legal"
    },
    "images": {
      "small": "https://images.pokemontcg.io/base1/1.png",
      "large": "https://images.pokemontcg.io/base1/1_hires.png"
    },
    "tcgplayer": {
      "url": "https://prices.pokemontcg.io/tcgplayer/base1-1",
      "updatedAt": "2023/01/15",
      "prices": { ... }
    }
  }
]
```

### Sets JSON Format
Each set file in `sets/en/` contains a single set object:

```json
{
  "id": "base1",
  "name": "Base",
  "series": "Base",
  "printedTotal": 102,
  "total": 102,
  "legalities": {
    "unlimited": "Legal"
  },
  "ptcgoCode": "BS",
  "releaseDate": "1999/01/09",
  "updatedAt": "2020/08/14 09:35:00",
  "images": {
    "symbol": "https://images.pokemontcg.io/base1/symbol.png",
    "logo": "https://images.pokemontcg.io/base1/logo.png"
  }
}
```

## Key Data Fields

### Card Images
- **small**: 250px width PNG (for grid display)
- **large**: 734px width PNG (for detail view)
- Hosted on `images.pokemontcg.io` CDN

### Card Identification
- **id**: Unique identifier (format: `{setId}-{cardNumber}`)
- **name**: Card name
- **number**: Card number within the set
- **set.id**: Set identifier

### Card Types
- **supertype**: Pokémon, Trainer, or Energy
- **subtypes**: Stage 1, Stage 2, Item, Supporter, etc.
- **types**: Fire, Water, Grass, Lightning, Psychic, Fighting, Darkness, Metal, Fairy, Dragon, Colorless

### Rarity Levels
- Common
- Uncommon
- Rare
- Rare Holo
- Rare Holo EX
- Rare Holo GX
- Rare Holo V
- Rare Ultra
- Rare Secret
- And more...

## Implementation Notes

### Data Loading Strategy
1. Fetch latest release info from GitHub API
2. Find the ZIP asset in the release
3. Download the ZIP file
4. Extract using JSZip library
5. Parse JSON files for cards and sets
6. Store in local KV storage for offline access

### Search and Matching
When scanning a card, the AI extracts:
- Card name
- Set name (optional)
- Card number (optional)

The database is searched to find the best match:
1. Exact name match
2. Filter by set if provided
3. Filter by card number if provided
4. Return the matched card with official artwork

### Database Size
- **Total Cards**: ~15,000-20,000 cards
- **Total Sets**: ~100-150 sets
- **ZIP Size**: Approximately 10-20MB
- **Extracted Size**: Approximately 30-40MB in memory

## Update Frequency
The Pokemon TCG Data repository is regularly updated with new sets and errata. The app should allow users to manually refresh their local database to get the latest data.

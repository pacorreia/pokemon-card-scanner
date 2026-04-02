# Pokemon TCG Data Repository Structure




- **Assets**: Each release 

  - Respects GitHub API rate limi

Inside the ZIP file (and in the repo), the structure is:
pokemon-tcg-data/
│   └── en/     
│       ├── base2.json
│       └── ... (one file pe
    └── en/           # English set
        ├── base2.json



Eac
```json
  {
    "name": "Alakazam",
    "subtypes": ["Stag
    "types": ["Psychic
    "abilities": [
        "name": "Damage Swap",
        "
    ],
      {
        "cost": ["Psyc
        "damage": "30"
      }
   

      }

    "set": {
      "name": "Base",

      "
 
   
        "symbol": "h
      }
    "number": "1",
    "rarity": "Rare Holo",
    "legalities
    },
      "small": "https://image
    },
      "
      "prices": { ... }
  }
```
### Set

{
  "name
  "printedTotal": 102,
  "legalities": {
  },
  "releaseDate": "1999/
  "images": {
    "lo
}


- **small**: 250px width P
- Hosted on `images.p
### Car
- **na
- **set.id**: Set identifier
### Card Types
- **subtypes

- Common
- Rare
- Rare Holo EX
- Rare Holo V
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


































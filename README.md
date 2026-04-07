# PokéDex Scanner

A web app for scanning and managing your Pokémon TCG card collection, powered by AI image recognition via GitHub Models.

## Features

- 📷 **Scan cards** with your camera or by uploading an image — AI identifies the card automatically
- ✍️ **Manual entry** for cards you want to add without scanning
- 📦 **Collection management** — organise cards into named collections
- 🔍 **Search & filter** by name, set, type, and rarity
- 📊 **Duplicate tracking** and estimated collection value
- 💾 **Import / export** your collection as JSON
- 🗄️ **Offline database** — downloads the full Pokémon TCG card database locally for accurate lookups and artwork

## Setup

### 1. Clone and install

```bash
git clone https://github.com/pacorreia/pokemon-card-scanner.git
cd pokemon-card-scanner
npm install
```

### 2. Get a GitHub Personal Access Token

The app uses [GitHub Models](https://models.github.ai) (`openai/gpt-4o`) to analyse card images.  
You need a GitHub PAT — **no extra scopes are required**.

1. Go to <https://github.com/settings/tokens/new?description=Pokemon+Card+Scanner&scopes=>
2. Click **Generate token** and copy it.

### 3. Start the API proxy (server-side token)

```bash
export GITHUB_MODELS_TOKEN="<your_github_pat>"
npm run dev:server
```

### 4. Start the frontend

```bash
npm run dev
```

Open <http://localhost:5173> in your browser.

### 5. Download the card database

On first launch the app will prompt you to download the Pokémon TCG database (card artwork, set info, and pricing).  
Click **Download** and wait for it to complete — this is stored by the backend in a SQLite database at `DATA_DIR/pokedex.db`, so the backend must be running to use it. The download persists on the server filesystem and typically only needs to be done once per data directory; back up `DATA_DIR/pokedex.db` if you want to preserve it.

### Optional: run both frontend + backend in one command

```bash
GITHUB_MODELS_TOKEN="<your_github_pat>" npm run dev:full
```

## Building for production

```bash
npm run build
```

Static output is written to `dist/`.

## License

MIT — Copyright GitHub, Inc.

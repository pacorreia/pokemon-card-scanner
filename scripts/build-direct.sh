#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "[build:direct] nvm not found at $NVM_DIR/nvm.sh"
  echo "[build:direct] Install nvm or run the build inside Docker."
  exit 1
fi

# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

nvm use >/dev/null
echo "[build:direct] Using Node $(node -v) from .nvmrc"

npm run build:core

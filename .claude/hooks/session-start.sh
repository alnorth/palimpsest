#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Activate Node version from .nvmrc via nvm
export NVM_DIR="/opt/nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$CLAUDE_PROJECT_DIR"
nvm install

# Persist the activated Node bin path for the session
echo "export PATH=$(dirname "$(which node)"):$PATH" >> "$CLAUDE_ENV_FILE"

npm install

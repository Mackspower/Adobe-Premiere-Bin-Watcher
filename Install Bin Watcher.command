#!/bin/bash
# Double-click this file in Finder to install Bin Watcher (macOS).
# Same as running `bash install-mac.sh` yourself - this just exists because
# Finder often opens a plain .sh file in a code editor instead of running it,
# while .command files are opened in Terminal by default.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/install-mac.sh"

echo ""
read -n 1 -s -r -p "Press any key to close this window..."
echo ""

#!/bin/bash
# Installs the Bin Watcher CEP panel for Adobe Premiere Pro and After Effects on macOS.
# Run from Terminal: bash install-mac.sh   (no sudo needed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/PremiereBinWatcher"

if [ ! -d "$SOURCE" ]; then
    echo "Could not find $SOURCE. Run this script from the folder it was checked out into." >&2
    exit 1
fi

DEST_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_ROOT/PremiereBinWatcher"

mkdir -p "$DEST_ROOT"
rm -rf "$DEST"
cp -R "$SOURCE" "$DEST"
echo "Copied extension to $DEST"

# Premiere Pro and After Effects both load unsigned/dev extensions only when
# the matching CEP runtime has PlayerDebugMode enabled. Different app
# versions use different CEP runtime versions, so we enable it for the ones
# in common use (roughly 2021 through 2025 releases).
for v in 7 8 9 10 11 12; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done
echo "Enabled debug mode for CEP runtimes (CSXS.7 - CSXS.12)"

echo ""
echo "Done. Restart Premiere Pro and/or After Effects, then open the panel via Window > Extensions > Bin Watcher."

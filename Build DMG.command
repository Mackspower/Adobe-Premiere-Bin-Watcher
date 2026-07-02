#!/bin/bash
# Double-click this file in Finder to build packaging/dist/BinWatcher.dmg.
# Same as running `bash packaging/build-dmg.sh` yourself - this just keeps
# the Terminal window open afterward so you can see what happened (a plain
# script run from Finder can otherwise close its window immediately when
# it finishes, before you get a chance to read the output).

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/packaging/build-dmg.sh"

echo ""
read -n 1 -s -r -p "Press any key to close this window..."
echo ""

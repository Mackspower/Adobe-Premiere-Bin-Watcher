#!/bin/bash
# Builds a macOS .dmg containing Bin Watcher and a double-clickable installer.
# Must be run on macOS - it uses hdiutil, a built-in macOS tool with no
# equivalent elsewhere, so this can't be built from Linux/Windows.
#
# This packages the *unsigned* install (install-mac.sh / debug-mode flow).
# It does not sign anything - see packaging/README.md for the signed-package
# path if you want to avoid Premiere's debug flag entirely. A .dmg alone
# doesn't change Gatekeeper's behavior: the first time it's opened, macOS
# will still show an "unidentified developer" warning unless the contents
# are notarized (which requires a paid Apple Developer account).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
DMG_NAME="BinWatcher"
DMG_PATH="$DIST_DIR/$DMG_NAME.dmg"
STAGE_DIR="$(mktemp -d)"

cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

mkdir -p "$DIST_DIR"
cp -R "$REPO_ROOT/PremiereBinWatcher" "$STAGE_DIR/"
cp "$REPO_ROOT/install-mac.sh" "$STAGE_DIR/"
cp "$REPO_ROOT/Install Bin Watcher.command" "$STAGE_DIR/"
cp "$REPO_ROOT/README.md" "$STAGE_DIR/"
chmod +x "$STAGE_DIR/install-mac.sh" "$STAGE_DIR/Install Bin Watcher.command"

rm -f "$DMG_PATH"
hdiutil create -volname "$DMG_NAME" -srcfolder "$STAGE_DIR" -ov -format UDZO "$DMG_PATH"

echo ""
echo "Built $DMG_PATH"
echo "Opening it and double-clicking \"Install Bin Watcher.command\" runs the same install as before."

#!/bin/bash
# Builds a signed .zxp package for Bin Watcher (macOS/Linux), so Premiere can
# load it without enabling PlayerDebugMode - a setting that disables Adobe's
# signature check for every CEP extension on the machine, not just this one.
# See packaging/README.md for the full walkthrough.
#
# Requires Adobe's ZXPSignCmd tool, which isn't vendored into this repo (it's
# Adobe's binary, not ours to redistribute). Download it from:
#   https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
# and either put it on your PATH, or save it as packaging/tools/ZXPSignCmd
# (chmod +x it).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$REPO_ROOT/PremiereBinWatcher"
CERT_DIR="$SCRIPT_DIR/cert"
DIST_DIR="$SCRIPT_DIR/dist"
CERT_PATH="$CERT_DIR/BinWatcher.p12"
ZXP_PATH="$DIST_DIR/BinWatcher.zxp"

find_signer() {
    if command -v ZXPSignCmd >/dev/null 2>&1; then
        command -v ZXPSignCmd
        return
    fi
    if [ -x "$SCRIPT_DIR/tools/ZXPSignCmd" ]; then
        echo "$SCRIPT_DIR/tools/ZXPSignCmd"
        return
    fi
    echo ""
}

SIGNER="$(find_signer)"
if [ -z "$SIGNER" ]; then
    echo "ZXPSignCmd not found." >&2
    echo "Download the build for your OS from:" >&2
    echo "  https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD" >&2
    echo "and place it at packaging/tools/ZXPSignCmd (chmod +x it), or put it on your PATH." >&2
    exit 1
fi

mkdir -p "$CERT_DIR" "$DIST_DIR"

echo -n "Certificate password: "
read -rs CERT_PASSWORD
echo

if [ ! -f "$CERT_PATH" ]; then
    echo "No signing certificate yet - creating a self-signed one at $CERT_PATH"
    "$SIGNER" -selfSignedCert US CA "Bin Watcher" "Bin Watcher" "$CERT_PASSWORD" "$CERT_PATH"
    echo "Certificate created. Keep this password - you'll need it for every future build, and for the trust step in packaging/README.md."
fi

echo "Signing $EXT_DIR -> $ZXP_PATH"
"$SIGNER" -sign "$EXT_DIR" "$ZXP_PATH" "$CERT_PATH" "$CERT_PASSWORD" -tsa http://timestamp.digicert.com

echo ""
echo "Built $ZXP_PATH"
echo "Next: trust the certificate on each machine that will install this, then install the .zxp - see packaging/README.md."

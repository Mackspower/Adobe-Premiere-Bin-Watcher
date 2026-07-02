# Builds a signed .zxp package for Bin Watcher (Windows), so Premiere can
# load it without enabling PlayerDebugMode - a setting that disables Adobe's
# signature check for every CEP extension on the machine, not just this one.
# See packaging/README.md for the full walkthrough.
#
# Requires Adobe's ZXPSignCmd.exe tool, which isn't vendored into this repo
# (it's Adobe's binary, not ours to redistribute). Download it from:
#   https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
# and either put it on your PATH, or save it as packaging\tools\ZXPSignCmd.exe

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$extDir = Join-Path $repoRoot "PremiereBinWatcher"
$certDir = Join-Path $scriptDir "cert"
$distDir = Join-Path $scriptDir "dist"
$certPath = Join-Path $certDir "BinWatcher.p12"
$zxpPath = Join-Path $distDir "BinWatcher.zxp"

function Find-Signer {
    $cmd = Get-Command "ZXPSignCmd.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $local = Join-Path $scriptDir "tools\ZXPSignCmd.exe"
    if (Test-Path $local) { return $local }
    return $null
}

$signer = Find-Signer
if (-not $signer) {
    Write-Error "ZXPSignCmd.exe not found. Download it from https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD and place it at packaging\tools\ZXPSignCmd.exe, or put it on your PATH."
    exit 1
}

New-Item -ItemType Directory -Path $certDir -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$securePassword = Read-Host "Certificate password" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$certPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if (!(Test-Path $certPath)) {
    Write-Host "No signing certificate yet - creating a self-signed one at $certPath"
    & $signer -selfSignedCert US CA "Bin Watcher" "Bin Watcher" $certPassword $certPath
    Write-Host "Certificate created. Keep this password - you'll need it for every future build, and for the trust step in packaging/README.md."
}

Write-Host "Signing $extDir -> $zxpPath"
& $signer -sign $extDir $zxpPath $certPath $certPassword -tsa http://timestamp.digicert.com

Write-Host ""
Write-Host "Built $zxpPath"
Write-Host "Next: trust the certificate on each machine that will install this, then install the .zxp - see packaging/README.md."

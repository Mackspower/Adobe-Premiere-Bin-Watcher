# Installs the Bin Watcher CEP panel for Adobe Premiere Pro on Windows.
# Run this from PowerShell (no admin rights required).

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $scriptDir "PremiereBinWatcher"

if (!(Test-Path $source)) {
    Write-Error "Could not find $source. Run this script from the folder it was checked out into."
    exit 1
}

$destRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$dest = Join-Path $destRoot "PremiereBinWatcher"

if (!(Test-Path $destRoot)) {
    New-Item -ItemType Directory -Path $destRoot -Force | Out-Null
}
if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
}
Copy-Item $source $dest -Recurse
Write-Host "Copied extension to $dest"

# Premiere Pro loads unsigned/dev extensions only when the matching CEP
# runtime has PlayerDebugMode enabled. Different Premiere Pro versions use
# different CEP runtime versions, so we enable it for the ones in common use
# (roughly Premiere Pro 2021 through 2025).
$csxsVersions = @("7", "8", "9", "10", "11", "12")
foreach ($v in $csxsVersions) {
    $regPath = "HKCU:\Software\Adobe\CSXS.$v"
    if (!(Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    New-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}
Write-Host "Enabled debug mode for CEP runtimes (CSXS.7 - CSXS.12)"

Write-Host ""
Write-Host "Done. Restart Premiere Pro, then open the panel via Window > Extensions > Bin Watcher."

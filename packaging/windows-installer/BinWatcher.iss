; Inno Setup script for Bin Watcher (Windows).
;
; This produces a real Setup.exe. It's built automatically on every GitHub
; Release by ../../.github/workflows/build-windows-installer.yml (a
; GitHub-hosted Windows runner installs Inno Setup and compiles this) - no
; local Windows machine needed. See the Releases page for the latest build:
; https://github.com/mackspower/Adobe-Premiere-Bin-Watcher/releases
;
; To build it yourself instead:
;   1. Install Inno Setup (free): https://jrsoftware.org/isinfo.php
;   2. Open this file in the Inno Setup Compiler and click Build (or run
;      "ISCC.exe BinWatcher.iss" from a Command Prompt in this folder).
;   3. The installer is written to packaging\dist\BinWatcherSetup.exe.
;
; Like the unsigned .zxp / debug-mode install, this Setup.exe is itself
; unsigned unless you separately get a code-signing certificate and sign it -
; Windows SmartScreen will show an "unknown publisher" warning on first run
; either way. This just replaces "download a zip and run a PowerShell
; script" with a normal-looking installer wizard; it doesn't change that
; underlying trust story.

[Setup]
AppName=Bin Watcher for Premiere Pro & After Effects
AppVersion=1.0
AppPublisher=Troy Rankin
DefaultDirName={userappdata}\Adobe\CEP\extensions\PremiereBinWatcher
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
OutputBaseFilename=BinWatcherSetup
OutputDir=..\dist
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\..\PremiereBinWatcher\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

; Premiere Pro and After Effects both load unsigned/dev extensions only when
; the matching CEP runtime has PlayerDebugMode enabled. Different app
; versions use different CEP runtime versions, so this covers the ones in
; common use (roughly 2021 through 2025 releases) - same set
; install-windows.ps1 sets.
[Registry]
Root: HKCU; Subkey: "Software\Adobe\CSXS.7"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.8"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"

[Messages]
FinishedLabel=Bin Watcher has been installed.%n%nRestart Premiere Pro or After Effects, then open it from Window > Extensions > Bin Watcher.

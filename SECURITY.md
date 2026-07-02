# Security overview

A short, plain-language summary of what Bin Watcher does and doesn't do — meant to be
handed to an IT/security reviewer before installing it on a managed machine.

## What it is

A Premiere Pro panel (a CEP extension) that watches folders you choose and imports new
files into a matching project bin automatically. Everything is in this repository,
MIT licensed, and readable as plain text — HTML, JavaScript, and Adobe ExtendScript,
nothing compiled or obfuscated. See `PremiereBinWatcher/client/app.js` (the panel logic)
and `PremiereBinWatcher/host/ppro.jsx` (the code that talks to Premiere's project).

## What it can access

- **Filesystem**: reads only the folders a user explicitly adds as a "watch" inside the
  panel, and reads/writes one settings file that stores that watch list
  (`%APPDATA%\PremiereBinWatcher\config.json` on Windows,
  `~/PremiereBinWatcher/config.json` on macOS). It does not scan, read, or write
  anything else on disk.
- **Premiere Pro's open project**: through Adobe's own scripting API (ExtendScript), it
  can read the project's bin structure and import files into it — the same capability
  any Premiere script or panel has by design.

## What it does NOT do

- **No network access.** No HTTP requests, no telemetry, no analytics, no
  auto-update/check-for-update mechanism. There is no `fetch`, `XMLHttpRequest`, or
  Node network module (`http`/`https`/`net`) anywhere in the codebase — verifiable with
  a text search of the source.
- **No credential or password handling.**
- **No execution of other programs** — it doesn't use Node's `child_process` or
  equivalent.
- **No data leaves the machine.**

## Why it may show up as "unsigned"

Adobe extensions normally need to be signed by a recognized certificate authority to
load without extra configuration. This is a personal/free tool without a paid
commercial signing certificate. Two install paths exist:

1. **`install-windows.ps1` / `install-mac.sh`** — enables Premiere's developer/debug
   flag (`PlayerDebugMode`), which allows Premiere to load unsigned CEP extensions in
   general (not scoped to just this one). Simplest, but relaxes a real security
   control machine-wide.
2. **`packaging/`** — builds a self-signed, trusted `.zxp` package instead, so Premiere
   loads Bin Watcher via a valid signature without the debug flag enabled at all. See
   `packaging/README.md` for the full walkthrough.

## Source

https://github.com/mackspower/claude — the root `README.md` has full install and usage
instructions; this file and `packaging/README.md` cover the security/signing side.

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
- **One native OS helper process, only when you click "Browse folder…"**: to work
  around Premiere's own folder-picker dialog sometimes opening behind Premiere's
  window, the panel launches the OS's built-in folder picker directly instead -
  `powershell.exe` on Windows (a fixed, inline script using .NET's
  `FolderBrowserDialog`, see `browseForFolderNative()` in `client/app.js`) or
  `osascript` on macOS (a fixed `choose folder` AppleScript command). Both commands are
  hardcoded in the source, never built from user input or anything downloaded, and do
  nothing beyond showing that one dialog and returning the chosen path.

## What it does NOT do

- **No network access.** No HTTP requests, no telemetry, no analytics, no
  auto-update/check-for-update mechanism. There is no `fetch`, `XMLHttpRequest`, or
  Node network module (`http`/`https`/`net`) anywhere in the codebase — verifiable with
  a text search of the source.
- **No credential or password handling.**
- **No arbitrary command execution.** `child_process` is used for exactly two fixed,
  auditable commands (the folder-picker helpers above) - never with dynamic or
  user-supplied content, and for nothing else.
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

https://github.com/mackspower/Adobe-Premiere-Bin-Watcher — the root `README.md` has full
install and usage instructions; this file and `packaging/README.md` cover the
security/signing side.

## Maintainer checklist (repo hygiene, not the extension itself)

This project is public and MIT licensed — anyone can clone, use, or fork it, but only
this repo's collaborators can push to it directly. A few settings worth keeping on,
checked from GitHub's repo Settings page:

- **Two-factor authentication on your own GitHub account.** The realistic risk to a
  public repo isn't a stranger editing your code (they can't, without you merging a
  PR) — it's someone taking over your account and pushing something malicious under
  your name. 2FA is the actual defense against that.
- **Branch protection on `main`**: Settings → Branches → Add rule → enable "Restrict
  force pushes" and "Do not allow deletions." Mostly protects you from an accidental
  `git push --force` rewriting history, cheap to leave on.
- **Secret scanning + push protection**: Settings → Code security and analysis.
  Secret scanning is normally automatic for public repos; push protection additionally
  blocks a commit *before* it's pushed if it looks like it contains a credential.
- **Read PR diffs before merging.** The only path for external code to land in `main`
  is you clicking merge on someone else's Pull Request — treat that review as the real
  security boundary, not a formality.
- **Recheck collaborators occasionally** (Settings → Collaborators) — confirm it's
  still just you (or whoever you've deliberately added) with write access.

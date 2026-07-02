# Bin Watcher for Premiere Pro

A free alternative to [Watchtower](https://knightsoftheeditingtable.com/) for the simple
case: tie a project bin to a folder on disk, and anything dropped into that folder gets
imported into the bin automatically.

Windows only for now (see "Expanding later" below).

## How it works

Premiere Pro no longer supports running standalone `.jsx` scripts from a menu (that's an
After Effects thing), so this is built as a small **CEP panel** — the same extension
framework Watchtower itself uses:

- `client/` — the panel UI (HTML/CSS/JS), running with Node.js enabled so it can poll
  folders directly with `fs.readdir`/`fs.stat`.
- `host/ppro.jsx` — ExtendScript that runs inside Premiere and does the actual
  `app.project.importFiles(...)` call into the target bin (creating the bin if it
  doesn't exist yet).
- `CSXS/manifest.xml` — the extension manifest that registers the panel with Premiere.

Every few seconds (configurable) the panel lists each watched folder, and imports any
file whose size has stayed the same across two checks in a row (so it doesn't try to
import a file that's still being copied in). Before importing, it checks the bin's
existing contents by name, so it's safe to restart Premiere or the panel without
duplicate imports.

## Install (Windows)

1. Download/clone this repo somewhere on your machine.
2. Open PowerShell in that folder and run:
   ```powershell
   .\install-windows.ps1
   ```
   This copies `PremiereBinWatcher/` into
   `%APPDATA%\Adobe\CEP\extensions\PremiereBinWatcher` and enables Premiere's
   "load unsigned extensions" debug flag (a per-user registry setting — no admin
   rights needed, and easy to undo by deleting the `PlayerDebugMode` values under
   `HKCU:\Software\Adobe\CSXS.*`).
3. Restart Premiere Pro.
4. Open the panel from **Window > Extensions > Bin Watcher**.

## Use

1. Click **Browse folder…** and pick the folder you want watched (the dialog can pop up
   *behind* Premiere's main window — if nothing seems to happen, try Alt+Tab).
2. Pick an existing bin from the **Bin** dropdown (this lists every bin already in your
   project, including nested ones), or choose **+ New top-level bin…** and type a name
   for a bin that doesn't exist yet.
3. Click **+ Add Watch**.
4. Drop files into that folder — they'll show up in the bin within a few seconds.

Click **Refresh** next to the Bin dropdown if you've created a new bin in Premiere since
opening the panel and want it to show up in the list.

Watches are saved to `%APPDATA%\PremiereBinWatcher\config.json` and reload automatically
next time you open the panel/project. You can pause/resume or remove a watch from the
panel, adjust the check interval, and edit the list of file extensions it imports
(defaults to common video/audio/image types; use `*` to import everything).

## Limitations (v1)

- Only top-level bins by name — no nested bin paths yet.
- No recursive subfolder support (a subfolder inside a watched folder is ignored).
- No image-sequence handling.
- Windows only — Premiere's CEP extensions folder and debug-mode registry keys are
  Windows-specific in this installer.

## Troubleshooting

**The panel opens but buttons don't do anything (e.g. "Browse folder…" does nothing).**

The panel now logs every step to the "Activity" box at the bottom, so this is the first
place to look:

- If you never see `Bin Watcher ready.` appear there when you open the panel, the
  panel's JavaScript failed to start — you should instead see a red error message
  explaining why (most likely "Node.js isn't available in this panel").
- If you see `Bin Watcher ready.` but clicking **Browse folder…** never logs
  `Opening folder browser...` / `Folder browser returned: ...`, the click isn't reaching
  the button at all — try fully quitting and reopening Premiere.
- If you see `Folder browser returned: ""`, the native folder-picker dialog opened but
  you clicked Cancel, or it opened behind Premiere's main window — check your other
  windows/monitors.

For a deeper look, this build ships with remote debugging enabled (the `.debug` file).
With Premiere open and the panel visible:

1. Open Chrome or Edge and go to `http://localhost:8088`.
2. Click the "Bin Watcher" entry listed there — it opens full Chrome DevTools attached
   to the panel, where you can see the Console tab for the exact error and stack trace.

If you make changes and reinstall, re-run `install-windows.ps1` (it deletes and
recopies the whole extension folder) and fully restart Premiere Pro.

**"I reinstalled but nothing seems different / I'm seeing behavior that doesn't match
the current code."**

Premiere's embedded browser (CEF) can cache the panel's HTML/JS/CSS on disk, separate
from the extension folder — restarting Premiere doesn't always clear it, so you can end
up running an old build even after a clean reinstall. Every startup, the Activity log
prints a line like `Bin Watcher starting... (build 5)`. Check that number against the
highest `?v=N` in `client/index.html` on the `main`/branch you pulled — if the panel
reports an older build, the cache is stale. Closing Premiere, reinstalling, and
reopening should now force a fresh load (the build number is baked into the cached
file's URL), but if it still won't budge, delete
`%APPDATA%\Adobe\CEP\extensions\PremiereBinWatcher`, clear Premiere's media/disk cache
from Edit > Preferences > Media Cache, and reinstall from scratch.

## Expanding later

- **macOS**: the panel code itself is cross-platform; only `install-windows.ps1` would
  need a macOS equivalent (copying to `~/Library/Application Support/Adobe/CEP/extensions`
  and setting the debug flag via `defaults write`).
- **Nested bins**: `host/ppro.jsx`'s `pbw_findOrCreateBin` currently only looks at
  top-level bins; it could walk a `/`-delimited bin path instead.
- **Recursive folders / image sequences**: extend the polling logic in `client/app.js`.

Note: Premiere Pro's extensibility is gradually moving from CEP to Adobe's newer UXP
framework (Adobe has said CEP/ExtendScript integrations remain supported into 2026).
This panel is built on CEP because it's what today's released Premiere versions support;
a future UXP port may be needed down the line.

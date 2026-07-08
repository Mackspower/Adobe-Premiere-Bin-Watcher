# Bin Watcher for Premiere Pro & After Effects

A free alternative to [Watchtower](https://knightsoftheeditingtable.com/) for the simple
case: tie a project bin (or, in After Effects, a folder) to a folder on disk, and
anything dropped into that folder gets imported automatically.

Works in both Premiere Pro and After Effects, on Windows and macOS — one install, same
panel, same features in either app.

**Just want it installed?** Skip to the
[plain-language step-by-step guide](INSTALL.md) (macOS and Windows) — download a
file from [Releases](https://github.com/mackspower/Adobe-Premiere-Bin-Watcher/releases),
double-click through it, done. The instructions below are the fuller/more technical
version, useful if you want to understand what's actually happening or prefer the
manual install.

The install steps below use Adobe's "load unsigned extensions" debug flag, which is
the fastest way to get running but relaxes a real security control machine-wide (see
[SECURITY.md](SECURITY.md)). If you're installing this on a work/managed machine,
read that first — `packaging/` has a signed-package alternative that avoids the
trade-off.

## How it works

This is built as a small **CEP panel** — the same extension framework Watchtower itself
uses, and the one both Premiere Pro and After Effects support:

- `client/` — the panel UI (HTML/CSS/JS), running with Node.js enabled so it can poll
  folders directly with `fs.readdir`/`fs.stat`. Identical in both apps — it talks to
  whichever host it's running in through the same handful of function names, so there's
  no Premiere-only or AE-only code here.
- `host/dispatch.jsx` — the entry point the extension manifest actually loads. It
  detects which app it's running in and routes to the matching implementation:
  `host/ppro.jsx` (Premiere, `app.project.importFiles(...)` into a bin) or
  `host/aeft.jsx` (After Effects, `app.project.importFile(...)` into a folder). Both
  create the target bin/folder if it doesn't exist yet.
- `CSXS/manifest.xml` — the extension manifest that registers the panel with both apps.

Every few seconds (configurable) the panel lists each watched folder, and imports any
file whose size has stayed the same across two checks in a row (so it doesn't try to
import a file that's still being copied in). Before importing, it checks the target
bin/folder's existing contents by name, so it's safe to restart the app or the panel
without duplicate imports.

## Install

### Windows

**Easiest**: download `BinWatcherSetup.exe` from the
[Releases page](https://github.com/mackspower/Adobe-Premiere-Bin-Watcher/releases) and
run it — see the [plain-language walkthrough](INSTALL.md#windows) if you want the
click-by-click version, including what the SmartScreen warning means and how to get
past it. It's built automatically by
[a GitHub Actions workflow](.github/workflows/build-windows-installer.yml) using the
free [Inno Setup](https://jrsoftware.org/isinfo.php) compiler — being unsigned, it'll
still show a SmartScreen "unknown publisher" prompt on first run, same trust story as
the script below, just a nicer install experience.

**Manual/script install**, if you'd rather not use the packaged installer:

1. Download/clone this repo somewhere on your machine.
2. Open PowerShell in that folder and run:
   ```powershell
   .\install-windows.ps1
   ```
   This copies `PremiereBinWatcher/` into
   `%APPDATA%\Adobe\CEP\extensions\PremiereBinWatcher` and enables the
   "load unsigned extensions" debug flag for Premiere Pro and After Effects alike
   (a per-user registry setting — no admin rights needed, and easy to undo by
   deleting the `PlayerDebugMode` values under `HKCU:\Software\Adobe\CSXS.*`).
3. Restart Premiere Pro and/or After Effects.
4. Open the panel from **Window > Extensions > Bin Watcher** in either app.

### macOS

1. Download/clone this repo somewhere on your machine.
2. Double-click **`Install Bin Watcher.command`** — it opens Terminal and runs the
   installer. (Don't double-click `install-mac.sh` directly; Finder often opens plain
   `.sh` files in a code editor like Xcode instead of running them. If Gatekeeper
   complains about an unidentified developer, right-click the `.command` file > Open
   instead of double-clicking.)

   Equivalently, from Terminal: `bash install-mac.sh`.

   This copies `PremiereBinWatcher/` into
   `~/Library/Application Support/Adobe/CEP/extensions/PremiereBinWatcher` and enables
   the "load unsigned extensions" debug flag for Premiere Pro and After Effects alike
   (a per-user default, no sudo needed — undo it later with
   `defaults delete com.adobe.CSXS.<version> PlayerDebugMode` for each version listed
   in the script).
3. Restart Premiere Pro and/or After Effects.
4. Open the panel from **Window > Extensions > Bin Watcher** in either app.

Prefer a `.dmg` you can hand to someone else? Double-click **`Build DMG.command`** (or
run `bash packaging/build-dmg.sh` yourself) — must be run on macOS — to produce
`packaging/dist/BinWatcher.dmg`.

## Use

1. Click **Browse folder…** and pick the folder you want watched. This opens the OS's
   own folder picker (not Premiere's), so it should come to the front reliably; if it
   ever doesn't, try Alt+Tab on Windows or Cmd+Tab on macOS. It also opens starting at
   the last folder you picked, since most projects live under one consistent folder
   structure. If you'd rather skip the picker, type or paste a path directly into the
   box underneath it and press Enter, or pick one from the **Recent folders** dropdown
   once you've used a couple.
2. Pick an existing bin from the **Bin** dropdown (this lists every bin already in your
   project, including nested ones), or choose **+ New top-level bin…** and type a name
   for a bin that doesn't exist yet. (In After Effects, the panel calls this **Folder**
   instead, matching that app's own terminology — everything else works identically.)
3. Click **+ Add Watch**.
4. Drop files into that folder — they'll show up in the bin within a few seconds.

Click **Refresh** next to the Bin dropdown if you've created a new bin since opening the
panel and want it to show up in the list.

Watches are saved to `%APPDATA%\PremiereBinWatcher\config.json` (Windows) or
`~/PremiereBinWatcher/config.json` (macOS) and reload automatically
next time you open the panel/project. You can pause/resume or remove a watch from the
panel, adjust the check interval, and edit the list of file extensions it imports
(defaults to common video/audio/image types; use `*` to import everything).

**Subfolders are watched too, and mirrored as sub-bins by default.** If your watched
folder is `IMAGES` and you drop files into `IMAGES\RAW`, Bin Watcher creates (or reuses)
a `RAW` bin inside your `IMAGES` bin and imports there — matching the folder structure
on disk, arbitrarily deep.

**Deleting an item from a bin (or folder, in After Effects) is permanent** — Bin Watcher won't re-import
it, even though the underlying file is still sitting in the watched folder. It only
re-imports a file if the file itself changes (different size) after that. If you ever
want to undo that and bring back everything currently missing from a bin, click
**Resync** on that watch — it forgets what's been "settled" for that watch and
re-checks the bin's actual contents on the next poll.

Click **Sync Now** on a watch to check it immediately instead of waiting for the next
automatic poll.

### Advanced options

Click **Advanced options** when adding a watch to reveal:

- **Flatten subfolders into this bin** — instead of mirroring subfolders as matching
  sub-bins, every file anywhere under the watched folder lands directly in the one bin
  you picked. Note: if two files in different subfolders share the exact same name,
  only one will end up imported (bin/folder items must have unique names within their
  container) — mirroring avoids this by keeping same-named files in separate sub-bins.
- **Import numbered image sequences as a single clip** — when on, a run of consecutively
  numbered stills sharing a name, extension, and digit-padding (e.g. `shot_0001.exr`,
  `shot_0002.exr`, … `shot_0100.exr`) gets imported as one sequence clip instead of a
  hundred separate project items, the same way Premiere's own Import dialog handles
  "Image Sequence." Off by default so existing behavior (import every file
  individually) doesn't change under you. A sequence only imports once every frame in
  it has finished copying.
- **Use a path relative to the project file** — stores the watched folder as a path
  relative to your `.prproj` file instead of an absolute path, so a template project
  (with its footage folder alongside it) keeps working after being copied or moved to
  a new location, or shared with someone else, as long as the relative layout between
  the project file and the folder stays the same. Requires the project to already be
  saved when you add the watch.
- **Label imported items** — applies a label color to items right after Bin Watcher
  imports them. Only touches items at the moment of import; if you change an item's
  label afterward by hand, Bin Watcher won't overwrite it again. In Premiere the
  dropdown shows Premiere's actual color names (Violet, Iris, etc.); in After Effects
  it shows generic "Label 1"–"Label 16" instead, since After Effects lets you rename
  and recolor all 16 of its labels yourself in Preferences > Labels, so a fixed name
  list would just be wrong for most people. The label still applies correctly either
  way — only the dropdown's wording differs.

Each watch remembers its own advanced-option settings, shown as small tags under its
entry in the list.

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
With the panel visible:

1. Open Chrome or Edge and go to `http://localhost:8088` (Premiere) or
   `http://localhost:8089` (After Effects).
2. Click the "Bin Watcher" entry listed there — it opens full Chrome DevTools attached
   to the panel, where you can see the Console tab for the exact error and stack trace.

If you make changes and reinstall, re-run `install-windows.ps1` / `install-mac.sh` (it
deletes and recopies the whole extension folder) and fully restart the app.

**"I reinstalled but nothing seems different / I'm seeing behavior that doesn't match
the current code."**

The embedded browser (CEF) both apps use for panels can cache the panel's HTML/JS/CSS
on disk, separate from the extension folder — restarting the app doesn't always clear
it, so you can end up running an old build even after a clean reinstall. Every startup,
the Activity log prints a line like `Bin Watcher starting... (build 5)`. Check that
number against the highest `?v=N` in `client/index.html` on the `main`/branch you
pulled — if the panel reports an older build, the cache is stale. Closing the app,
reinstalling, and reopening should now force a fresh load (the build number is baked
into the cached file's URL), but if it still won't budge, delete the extension folder
(`%APPDATA%\Adobe\CEP\extensions\PremiereBinWatcher` on Windows,
`~/Library/Application Support/Adobe/CEP/extensions/PremiereBinWatcher` on macOS), clear
the app's media/disk cache (Premiere: Preferences > Media Cache; After Effects:
Preferences > Media & Disk Cache), and reinstall from scratch.

## Expanding later

Note: Premiere Pro and After Effects' extensibility is gradually moving from CEP to
Adobe's newer UXP framework (Adobe has said CEP/ExtendScript integrations remain
supported into 2026). This panel is built on CEP because it's what today's released
versions of both apps support; a future UXP port may be needed down the line.

## License

MIT — see [LICENSE](LICENSE). Free to use, modify, and share.

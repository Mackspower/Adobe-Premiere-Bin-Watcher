# Bin Watcher for Premiere Pro

A free alternative to [Watchtower](https://knightsoftheeditingtable.com/) for the simple
case: tie a project bin to a folder on disk, and anything dropped into that folder gets
imported into the bin automatically.

Works on Windows and macOS.

The install steps below use Premiere's "load unsigned extensions" debug flag, which is
the fastest way to get running but relaxes a real security control machine-wide (see
[SECURITY.md](SECURITY.md)). If you're installing this on a work/managed machine,
read that first — `packaging/` has a signed-package alternative that avoids the
trade-off.

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

## Install

### Windows

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

Prefer a normal installer wizard (`Setup.exe`) instead of running a script? See
`packaging/windows-installer/` — it builds one with the free
[Inno Setup](https://jrsoftware.org/isinfo.php) compiler. It's not compiled here
(that needs Inno Setup installed on a Windows machine), and being unsigned it'll still
show a SmartScreen "unknown publisher" prompt on first run — it's a nicer install
experience, not a different trust story than the script above.

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
   Premiere's "load unsigned extensions" debug flag (a per-user default, no sudo needed
   — undo it later with `defaults delete com.adobe.CSXS.<version> PlayerDebugMode` for
   each version listed in the script).
3. Restart Premiere Pro.
4. Open the panel from **Window > Extensions > Bin Watcher**.

Prefer a `.dmg` you can hand to someone else? `bash packaging/build-dmg.sh` (must be
run on macOS) bundles the same installer into `packaging/dist/BinWatcher.dmg`.

## Use

1. Click **Browse folder…** and pick the folder you want watched (the dialog can pop up
   *behind* Premiere's main window — if nothing seems to happen, try Alt+Tab on Windows
   or Cmd+Tab on macOS).
2. Pick an existing bin from the **Bin** dropdown (this lists every bin already in your
   project, including nested ones), or choose **+ New top-level bin…** and type a name
   for a bin that doesn't exist yet.
3. Click **+ Add Watch**.
4. Drop files into that folder — they'll show up in the bin within a few seconds.

Click **Refresh** next to the Bin dropdown if you've created a new bin in Premiere since
opening the panel and want it to show up in the list.

Watches are saved to `%APPDATA%\PremiereBinWatcher\config.json` (Windows) or
`~/PremiereBinWatcher/config.json` (macOS) and reload automatically
next time you open the panel/project. You can pause/resume or remove a watch from the
panel, adjust the check interval, and edit the list of file extensions it imports
(defaults to common video/audio/image types; use `*` to import everything).

**Subfolders are watched too, and mirrored as sub-bins.** If your watched folder is
`IMAGES` and you drop files into `IMAGES\RAW`, Bin Watcher creates (or reuses) a `RAW`
bin inside your `IMAGES` bin and imports there — matching the folder structure on disk,
arbitrarily deep.

**Deleting an item from a bin in Premiere is permanent** — Bin Watcher won't re-import
it, even though the underlying file is still sitting in the watched folder. It only
re-imports a file if the file itself changes (different size) after that. If you ever
want to undo that and bring back everything currently missing from a bin, click
**Resync** on that watch — it forgets what's been "settled" for that watch and
re-checks the bin's actual contents on the next poll.

## Limitations (v1)

- No image-sequence handling.

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

If you make changes and reinstall, re-run `install-windows.ps1` / `install-mac.sh` (it
deletes and recopies the whole extension folder) and fully restart Premiere Pro.

**"I reinstalled but nothing seems different / I'm seeing behavior that doesn't match
the current code."**

Premiere's embedded browser (CEF) can cache the panel's HTML/JS/CSS on disk, separate
from the extension folder — restarting Premiere doesn't always clear it, so you can end
up running an old build even after a clean reinstall. Every startup, the Activity log
prints a line like `Bin Watcher starting... (build 5)`. Check that number against the
highest `?v=N` in `client/index.html` on the `main`/branch you pulled — if the panel
reports an older build, the cache is stale. Closing Premiere, reinstalling, and
reopening should now force a fresh load (the build number is baked into the cached
file's URL), but if it still won't budge, delete the extension folder
(`%APPDATA%\Adobe\CEP\extensions\PremiereBinWatcher` on Windows,
`~/Library/Application Support/Adobe/CEP/extensions/PremiereBinWatcher` on macOS), clear
Premiere's media/disk cache from Preferences > Media Cache, and reinstall from scratch.

## Expanding later

- **Image sequences**: extend the polling logic in `client/app.js` to detect and import
  numbered-stills sequences as a single clip instead of individual files.

Note: Premiere Pro's extensibility is gradually moving from CEP to Adobe's newer UXP
framework (Adobe has said CEP/ExtendScript integrations remain supported into 2026).
This panel is built on CEP because it's what today's released Premiere versions support;
a future UXP port may be needed down the line.

## License

MIT — see [LICENSE](LICENSE). Free to use, modify, and share.

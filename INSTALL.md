# Installing Bin Watcher on macOS

No coding or command-line experience required — just downloading and clicking through
a couple of prompts.

## Step 1: Download

1. Go to the [Releases page](https://github.com/mackspower/Adobe-Premiere-Bin-Watcher/releases).
2. Under the latest release, click **BinWatcher.dmg** to download it.
3. Open your **Downloads** folder and double-click **BinWatcher.dmg**. A new window
   opens showing the files inside.

## Step 2: Run the installer

1. In that window, double-click **Install Bin Watcher.command**.
2. macOS will likely show a warning that it "cannot be opened because it is from an
   unidentified developer." This is expected for a free, independently-made tool (it
   isn't signed by Apple) — here's how to get past it:
   - **Right-click** (or hold Control and click) **Install Bin Watcher.command**
     instead of double-clicking it.
   - Choose **Open** from the menu that appears.
   - A dialog pops up asking if you're sure. Click **Open** again.
3. A black Terminal window opens and runs the install automatically. You'll see a few
   lines of text, ending with a line that says **"Done."** — that means it worked.
4. Press any key to close that window.

*(You only need the right-click trick the very first time. If you ever reinstall, you
can just double-click normally.)*

## Step 3: Restart Premiere Pro

If Premiere Pro is already open, quit it completely — **Premiere Pro menu → Quit
Premiere Pro**, or press Cmd+Q — then open it again. (Just closing the project window
isn't enough; it needs to fully restart.)

## Step 4: Open the panel

In Premiere Pro's menu bar at the top of the screen, click:

**Window → Extensions → Bin Watcher**

A small panel appears. That's it — you're installed.

## What's next

For how to actually use the panel (pointing a folder at a bin, etc.), see the
[main README](README.md#use).

## Something not working?

Check the [Troubleshooting section](README.md#troubleshooting) in the main README —
the panel itself logs what it's doing in an "Activity" box at the bottom, which is the
first place to look if something seems off.

---

## Windows

A one-click Windows installer isn't ready yet. In the meantime, Windows installation is
a bit more manual — see the [Windows section of the main README](README.md#windows) for
those steps (it involves running a script in PowerShell rather than double-clicking a
file, but the actual steps are short).

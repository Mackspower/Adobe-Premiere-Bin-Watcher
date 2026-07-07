// Bin Watcher panel logic. Runs in the CEP panel's page context with Node
// integration enabled (see manifest.xml: --enable-nodejs --mixed-context).
//
// Everything is wrapped in one IIFE with a top-level try/catch around the
// Node require() calls, and a window "error" listener, so that if anything
// breaks, it shows up as a message in the on-panel Activity log instead of
// failing completely silently (which is what a raw uncaught exception at
// the top of the file would otherwise do - it would stop every line below
// it, including all the button click handlers, from ever registering).

(function () {
    "use strict";

    const APP_VERSION = 9;

    function log(msg) {
        try {
            const el = document.getElementById("log");
            const time = new Date().toLocaleTimeString();
            const line = document.createElement("div");
            line.textContent = `[${time}] ${msg}`;
            el.insertBefore(line, el.firstChild);
            while (el.childNodes.length > 200) el.removeChild(el.lastChild);
        } catch (e) {
            // DOM not ready; nothing more we can do.
        }
    }

    window.addEventListener("error", function (e) {
        log("Script error: " + e.message + (e.filename ? ` (${e.filename}:${e.lineno})` : ""));
    });

    let fs, path, os;
    try {
        fs = require("fs");
        path = require("path");
        os = require("os");
    } catch (e) {
        log("Node.js isn't available in this panel: " + e.message);
        log("Folder watching can't work until that's fixed - see the README troubleshooting section.");
        const browseBtn = document.getElementById("browseBtn");
        const addBtn = document.getElementById("addBtn");
        if (browseBtn) browseBtn.disabled = true;
        if (addBtn) addBtn.disabled = true;
        return;
    }

    const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), "PremiereBinWatcher");
    const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

    const DEFAULT_EXTENSIONS =
        "mp4,mov,mxf,avi,mkv,braw,r3d,ari,dpx,exr,tga,mp3,wav,aif,aiff,m4a,jpg,jpeg,png,tif,tiff,psd,gif";

    const NEW_BIN_VALUE = "__new__";

    // Premiere Pro's label color palette, index order matches
    // ProjectItem.setColorLabel()'s accepted integer argument.
    const LABEL_COLORS = [
        "Violet", "Iris", "Caribbean", "Lavender", "Cerulean", "Forest", "Rose",
        "Mango", "Purple", "Blue", "Teal", "Magenta", "Tan", "Green", "Brown", "Yellow"
    ];

    let state = {
        watches: [], // { id, folder, binPath: [names...], binLabel, enabled }
        pollSeconds: 3,
        extensions: DEFAULT_EXTENSIONS,
        // Per watch, the size a file was at when we last confirmed it was
        // present in its bin. Lets us tell "never seen this file" (import
        // it) apart from "this was imported and then deliberately removed
        // from the bin" (leave it alone) - both look identical otherwise,
        // since the only other signal is whether the bin currently
        // contains a matching item.
        importHistory: {} // { [watchId]: { [relativeFileKey]: size } }
    };

    function historyFor(watchId) {
        if (!state.importHistory[watchId]) state.importHistory[watchId] = {};
        return state.importHistory[watchId];
    }

    // In-memory only: filename -> { size } per watch, used to detect that a
    // file has finished copying (its size stopped changing between polls).
    const pendingSizes = {};
    const timers = {};

    function evalScript(script, cb) {
        if (!window.PBW || typeof window.PBW.evalScript !== "function") {
            log("CEP bridge (cep-bridge.js) isn't loaded - can't talk to Premiere.");
            if (cb) cb(JSON.stringify({ success: false, error: "no PBW bridge" }));
            return;
        }
        window.PBW.evalScript(script, cb);
    }

    function uid() {
        return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function loadState() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const raw = fs.readFileSync(CONFIG_FILE, "utf8");
                const parsed = JSON.parse(raw);
                state = Object.assign({}, state, parsed);
            }
        } catch (e) {
            log("Failed to load saved settings: " + e.message);
        }

        // Migrate watches saved by older versions (single "bin" name string
        // instead of a binPath array, for top-level-only bins; and default
        // values for settings added later).
        let migrated = false;
        state.watches.forEach((w) => {
            if (!w.binPath) {
                w.binPath = [w.bin || "Untitled"];
                migrated = true;
            }
            if (!w.binLabel) {
                w.binLabel = w.binPath.join(" / ");
                migrated = true;
            }
            if (w.flattenSubfolders === undefined) {
                w.flattenSubfolders = false;
                migrated = true;
            }
            if (w.importSequences === undefined) {
                w.importSequences = false;
                migrated = true;
            }
            if (w.labelColorIndex === undefined) {
                w.labelColorIndex = null;
                migrated = true;
            }
            if (w.useRelativePath === undefined) {
                w.useRelativePath = false;
                w.relativePath = "";
                migrated = true;
            }
        });
        if (migrated) saveState();
    }

    function saveState() {
        try {
            if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(state, null, 2), "utf8");
        } catch (e) {
            log("Failed to save settings: " + e.message);
        }
    }

    function allowedExtensions() {
        return state.extensions
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
    }

    function isAllowed(filename) {
        const exts = allowedExtensions();
        if (exts.indexOf("*") !== -1) return true;
        const ext = path.extname(filename).slice(1).toLowerCase();
        return exts.indexOf(ext) !== -1;
    }

    const pollingInProgress = {};

    // Extensions worth checking for sequence membership - stills only, so a
    // pair of similarly-numbered video/audio files never gets mistaken for
    // one. Sequence detection itself is opt-in per watch either way.
    const SEQUENCE_EXTENSIONS = [
        "jpg", "jpeg", "png", "tif", "tiff", "exr", "dpx", "psd", "tga", "bmp", "gif", "jp2", "sgi", "cin"
    ];
    const SEQUENCE_NAME_RE = /^(.*?)(\d+)(\.[^.]+)$/;

    // Splits a flat list of file names into image-sequence groups (2+ files
    // sharing a prefix/extension/digit-width, differing only by a trailing
    // number - e.g. shot_0001.exr, shot_0002.exr, ...) and everything else.
    function groupSequences(names) {
        const groups = {};
        const standalone = [];

        names.forEach((name) => {
            const ext = path.extname(name).slice(1).toLowerCase();
            const m = name.match(SEQUENCE_NAME_RE);
            if (!m || SEQUENCE_EXTENSIONS.indexOf(ext) === -1) {
                standalone.push(name);
                return;
            }
            const prefix = m[1];
            const digits = m[2];
            const extWithDot = m[3];
            const key = prefix + " " + extWithDot + " " + digits.length;
            if (!groups[key]) groups[key] = [];
            groups[key].push({ name, num: parseInt(digits, 10) });
        });

        const sequences = [];
        Object.keys(groups).forEach((key) => {
            const members = groups[key];
            if (members.length < 2) {
                members.forEach((m) => standalone.push(m.name));
                return;
            }
            members.sort((a, b) => a.num - b.num);
            sequences.push({
                firstFrame: members[0].name,
                frames: members.map((m) => m.name)
            });
        });

        return { sequences, standalone };
    }

    // Resolves a watch's actual folder for this poll: either its stored
    // absolute path, or (if useRelativePath) re-resolved against the
    // currently open project's location every time, so a template project
    // moved/copied elsewhere still finds the right folder.
    async function resolveWatchFolder(watch) {
        if (!watch.useRelativePath) return watch.folder;

        const projectPath = await new Promise((resolve) => {
            evalScript("pbw_getProjectPath()", (result) => resolve(result || ""));
        });
        if (!projectPath) {
            log(`"${watch.binLabel}": can't resolve its relative path - the project hasn't been saved yet.`);
            return null;
        }

        const projectDir = path.dirname(projectPath);
        const resolved = path.resolve(projectDir, watch.relativePath);
        watch.folder = resolved; // cached for display only; always re-resolved above
        return resolved;
    }

    // Recursively lists files under rootDir, each tagged with the relative
    // subfolder (native separators) it was found in ("" for the root
    // itself). Unreadable subfolders are skipped rather than aborting the
    // whole walk.
    async function walkDir(rootDir, relDir) {
        const dirPath = relDir ? path.join(rootDir, relDir) : rootDir;
        let entries;
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (e) {
            return [];
        }

        let files = [];
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const childRel = relDir ? path.join(relDir, entry.name) : entry.name;
                files = files.concat(await walkDir(rootDir, childRel));
            } else if (entry.isFile()) {
                files.push({ relDir, name: entry.name });
            }
        }
        return files;
    }

    async function pollWatch(watch) {
        if (pollingInProgress[watch.id]) return;
        pollingInProgress[watch.id] = true;
        try {
            const actualFolder = await resolveWatchFolder(watch);
            if (!actualFolder) return;

            try {
                await fs.promises.access(actualFolder, fs.constants.R_OK);
            } catch (err) {
                log(`"${watch.binLabel}": can't read folder (${err.message})`);
                return;
            }

            const found = (await walkDir(actualFolder, "")).filter((f) => isAllowed(f.name));

            const prevPending = pendingSizes[watch.id] || {};
            const nextPending = {};
            const readyByDir = {}; // relDir -> [{name, size}]
            const history = historyFor(watch.id);

            await Promise.all(
                found.map(async (f) => {
                    const key = f.relDir ? path.join(f.relDir, f.name) : f.name;
                    try {
                        const stats = await fs.promises.stat(path.join(actualFolder, f.relDir, f.name));

                        // Already handled before at this exact size - either
                        // it's still sitting in the bin, or you deliberately
                        // removed it from the bin and we shouldn't put it back.
                        if (history[key] === stats.size) return;

                        const prev = prevPending[key];
                        if (prev && prev.size === stats.size) {
                            if (!readyByDir[f.relDir]) readyByDir[f.relDir] = [];
                            readyByDir[f.relDir].push({ name: f.name, size: stats.size });
                        } else {
                            nextPending[key] = { size: stats.size };
                        }
                    } catch (e) {
                        // File vanished between listing and stat-ing it; skip for now.
                    }
                })
            );

            pendingSizes[watch.id] = nextPending;

            Object.keys(readyByDir).forEach((relDir) => {
                const subSegments = relDir ? relDir.split(path.sep).filter(Boolean) : [];
                const targetBinPath = watch.flattenSubfolders ? watch.binPath : watch.binPath.concat(subSegments);
                const targetFolder = path.join(actualFolder, relDir);
                const readyItems = readyByDir[relDir];

                if (watch.importSequences) {
                    const readyNames = readyItems.map((i) => i.name);
                    const { sequences, standalone } = groupSequences(readyNames);

                    sequences.forEach((seq) => {
                        const frameItems = seq.frames.map((name) => readyItems.find((i) => i.name === name));
                        importReady(watch, relDir, [frameItems[0]], targetFolder, targetBinPath, {
                            importAsNumberedStills: true,
                            historyItems: frameItems
                        });
                    });

                    if (standalone.length) {
                        const items = standalone.map((name) => readyItems.find((i) => i.name === name));
                        importReady(watch, relDir, items, targetFolder, targetBinPath, {});
                    }
                } else {
                    importReady(watch, relDir, readyItems, targetFolder, targetBinPath, {});
                }
            });
        } finally {
            pollingInProgress[watch.id] = false;
        }
    }

    function importReady(watch, relDir, items, folder, binPath, options) {
        options = options || {};
        const binLabel = binPath.join(" / ");
        const filenames = items.map((i) => i.name);
        // A single JSON payload, JSON.stringify'd exactly once for the
        // ExtendScript call, rather than nesting JSON.stringify calls for
        // each argument - fewer levels of escaping means fewer ways for the
        // generated script text to end up malformed.
        const payload = JSON.stringify({
            folder,
            files: filenames,
            binPath,
            importAsNumberedStills: !!options.importAsNumberedStills,
            labelColorIndex: typeof watch.labelColorIndex === "number" ? watch.labelColorIndex : null
        });
        const script = `pbw_importFiles(${JSON.stringify(payload)})`;

        evalScript(script, (result) => {
            try {
                const parsed = JSON.parse(result);
                if (parsed.success && parsed.imported && parsed.imported.length) {
                    log(`Imported into "${binLabel}": ${parsed.imported.join(", ")}`);
                } else if (!parsed.success) {
                    log(`Import failed for "${binLabel}": ${parsed.error || "unknown error"}`);
                }

                // Anything the host confirms is now in the bin (freshly
                // imported or already there) is "settled" - stop asking
                // about it until its size changes.
                if (parsed.present && parsed.present.length) {
                    const history = historyFor(watch.id);
                    if (options.historyItems) {
                        // Sequence: only the first frame was actually sent,
                        // but if the host confirms it, every frame in the
                        // sequence should be treated as settled too - none
                        // of them were individually imported, so none of
                        // them would otherwise show up in `present`.
                        if (parsed.present.indexOf(filenames[0]) !== -1) {
                            options.historyItems.forEach((item) => {
                                const key = relDir ? path.join(relDir, item.name) : item.name;
                                history[key] = item.size;
                            });
                        }
                    } else {
                        parsed.present.forEach((name) => {
                            const item = items.find((i) => i.name === name);
                            if (item) {
                                const key = relDir ? path.join(relDir, name) : name;
                                history[key] = item.size;
                            }
                        });
                    }
                    saveState();
                }
            } catch (e) {
                log(`Unexpected response for "${binLabel}": ${result}`);
                log(`(payload sent: ${payload})`);
            }
        });
    }

    function startWatch(watch) {
        stopWatch(watch.id);
        pendingSizes[watch.id] = {};
        const ms = Math.max(1, Number(state.pollSeconds) || 3) * 1000;
        timers[watch.id] = setInterval(() => pollWatch(watch), ms);
        pollWatch(watch);
    }

    function stopWatch(id) {
        if (timers[id]) {
            clearInterval(timers[id]);
            delete timers[id];
        }
    }

    function restartAllTimers() {
        state.watches.forEach((w) => {
            if (w.enabled) startWatch(w);
            else stopWatch(w.id);
        });
    }

    // ---- UI wiring ----

    let selectedFolder = "";

    function render() {
        const list = document.getElementById("watchList");
        list.innerHTML = "";

        if (state.watches.length === 0) {
            list.innerHTML = '<div class="empty">No watches yet.</div>';
            return;
        }

        state.watches.forEach((w) => {
            const item = document.createElement("div");
            item.className = "watch-item";

            const badges = [];
            if (w.useRelativePath) badges.push("Relative path");
            if (w.flattenSubfolders) badges.push("Flattened");
            if (w.importSequences) badges.push("Sequences");
            if (typeof w.labelColorIndex === "number") badges.push(`Label: ${LABEL_COLORS[w.labelColorIndex]}`);
            const badgeHtml = badges.length
                ? `<div class="meta">${badges.map((b) => escapeHtml(b)).join(" &middot; ")}</div>`
                : "";

            const folderLine = w.useRelativePath
                ? `${escapeHtml(w.relativePath)} <span class="empty">(relative to project)</span>`
                : escapeHtml(w.folder);

            item.innerHTML = `
                <div class="top">
                    <div>
                        <span class="status-dot ${w.enabled ? "status-on" : "status-off"}"></span>
                        <span class="bin-name">${escapeHtml(w.binLabel)}</span>
                    </div>
                    <div class="actions">
                        <button data-action="sync" data-id="${w.id}" title="Check this watch right now instead of waiting for the timer">Sync Now</button>
                        <button data-action="toggle" data-id="${w.id}">${w.enabled ? "Pause" : "Resume"}</button>
                        <button data-action="resync" data-id="${w.id}" title="Re-add anything you've deleted from this bin since it was last imported">Resync</button>
                        <button data-action="remove" data-id="${w.id}" class="danger">Remove</button>
                    </div>
                </div>
                <div class="folder" title="${escapeHtml(w.folder)}">${folderLine}</div>
                ${badgeHtml}
            `;
            list.appendChild(item);
        });
    }

    function escapeHtml(s) {
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    function updateFolderLabel() {
        const el = document.getElementById("folderPath");
        if (selectedFolder) {
            el.textContent = selectedFolder;
            el.classList.remove("empty");
        } else {
            el.textContent = "No folder selected";
            el.classList.add("empty");
        }
    }

    document.getElementById("browseBtn").addEventListener("click", () => {
        log("Opening folder browser... (if no window appears, try Alt+Tab - it can open behind Premiere)");
        evalScript("pbw_selectFolder()", (result) => {
            log("Folder browser returned: " + JSON.stringify(result));
            if (result) {
                selectedFolder = result;
                updateFolderLabel();
            }
        });
    });

    function populateBinSelect(binPaths) {
        const select = document.getElementById("binSelect");
        const previousValue = select.value;
        select.innerHTML = "";

        binPaths
            .slice()
            .sort((a, b) => a.join(" / ").localeCompare(b.join(" / ")))
            .forEach((p) => {
                const opt = document.createElement("option");
                opt.value = JSON.stringify(p);
                opt.textContent = p.join(" / ");
                select.appendChild(opt);
            });

        const newOpt = document.createElement("option");
        newOpt.value = NEW_BIN_VALUE;
        newOpt.textContent = "+ New top-level bin…";
        select.appendChild(newOpt);

        if (previousValue && Array.from(select.options).some((o) => o.value === previousValue)) {
            select.value = previousValue;
        } else if (binPaths.length === 0) {
            select.value = NEW_BIN_VALUE;
        }

        updateNewBinVisibility();
    }

    function updateNewBinVisibility() {
        const select = document.getElementById("binSelect");
        const newBinInput = document.getElementById("newBinNameInput");
        newBinInput.style.display = select.value === NEW_BIN_VALUE ? "" : "none";
    }

    function refreshBins() {
        evalScript("pbw_listBins()", (result) => {
            try {
                const binPaths = JSON.parse(result);
                populateBinSelect(binPaths);
            } catch (e) {
                log("Couldn't load bin list from the project: " + result);
                populateBinSelect([]);
            }
        });
    }

    document.getElementById("binSelect").addEventListener("change", updateNewBinVisibility);
    document.getElementById("refreshBinsBtn").addEventListener("click", refreshBins);

    document.getElementById("addBtn").addEventListener("click", async () => {
        if (!selectedFolder) {
            log("Pick a folder before adding a watch.");
            return;
        }

        const select = document.getElementById("binSelect");
        let binPath;
        if (select.value === NEW_BIN_VALUE) {
            const newName = document.getElementById("newBinNameInput").value.trim();
            if (!newName) {
                log("Enter a name for the new bin before adding a watch.");
                return;
            }
            binPath = [newName];
        } else if (select.value) {
            binPath = JSON.parse(select.value);
        } else {
            log("Pick a bin before adding a watch.");
            return;
        }

        const binLabel = binPath.join(" / ");
        const flattenSubfolders = document.getElementById("flattenCheckbox").checked;
        const importSequences = document.getElementById("sequencesCheckbox").checked;
        const labelSelectValue = document.getElementById("labelColorSelect").value;
        const labelColorIndex = labelSelectValue === "" ? null : Number(labelSelectValue);
        const useRelativePath = document.getElementById("relativePathCheckbox").checked;

        let relativePath = "";
        if (useRelativePath) {
            const projectPath = await new Promise((resolve) => {
                evalScript("pbw_getProjectPath()", (result) => resolve(result || ""));
            });
            if (!projectPath) {
                log("Can't use a relative path - save the Premiere project first, then try again.");
                return;
            }
            relativePath = path.relative(path.dirname(projectPath), selectedFolder);
        }

        const watch = {
            id: uid(),
            folder: selectedFolder,
            binPath,
            binLabel,
            enabled: true,
            flattenSubfolders,
            importSequences,
            labelColorIndex,
            useRelativePath,
            relativePath
        };
        state.watches.push(watch);
        saveState();
        render();
        startWatch(watch);
        log(`Watching "${selectedFolder}" -> bin "${binLabel}"`);

        selectedFolder = "";
        updateFolderLabel();
        document.getElementById("newBinNameInput").value = "";
        document.getElementById("flattenCheckbox").checked = false;
        document.getElementById("sequencesCheckbox").checked = false;
        document.getElementById("labelColorSelect").value = "";
        document.getElementById("relativePathCheckbox").checked = false;
        refreshBins();
    });

    document.getElementById("watchList").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const watch = state.watches.find((w) => w.id === id);
        if (!watch) return;

        if (action === "toggle") {
            watch.enabled = !watch.enabled;
            if (watch.enabled) startWatch(watch);
            else stopWatch(watch.id);
            saveState();
            render();
        } else if (action === "remove") {
            stopWatch(watch.id);
            delete pendingSizes[watch.id];
            delete state.importHistory[watch.id];
            state.watches = state.watches.filter((w) => w.id !== id);
            saveState();
            render();
        } else if (action === "resync") {
            delete state.importHistory[watch.id];
            delete pendingSizes[watch.id];
            saveState();
            log(`Cleared import history for "${watch.binLabel}" - anything missing from the bin will be re-added.`);
            pollWatch(watch);
        } else if (action === "sync") {
            log(`Checking "${watch.binLabel}" now...`);
            pollWatch(watch);
        }
    });

    document.getElementById("pollInput").addEventListener("change", (e) => {
        const v = Math.max(1, Number(e.target.value) || 3);
        state.pollSeconds = v;
        e.target.value = v;
        saveState();
        restartAllTimers();
    });

    document.getElementById("extInput").addEventListener("change", (e) => {
        state.extensions = e.target.value.trim() || DEFAULT_EXTENSIONS;
        saveState();
    });

    function populateLabelColorSelect() {
        const select = document.getElementById("labelColorSelect");
        LABEL_COLORS.forEach((name, index) => {
            const opt = document.createElement("option");
            opt.value = String(index);
            opt.textContent = name;
            select.appendChild(opt);
        });
    }

    // ---- init ----

    log(`Bin Watcher starting... (build ${APP_VERSION})`);
    loadState();
    document.getElementById("pollInput").value = state.pollSeconds;
    document.getElementById("extInput").value = state.extensions;
    populateLabelColorSelect();
    render();
    restartAllTimers();
    refreshBins();
    log("Bin Watcher ready.");
})();

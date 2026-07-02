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

    const APP_VERSION = 7;

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
        "mp4,mov,mxf,avi,mkv,braw,r3d,ari,dpx,mp3,wav,aif,aiff,m4a,jpg,jpeg,png,tif,tiff,psd,gif";

    const NEW_BIN_VALUE = "__new__";

    let state = {
        watches: [], // { id, folder, binPath: [names...], binLabel, enabled }
        pollSeconds: 3,
        extensions: DEFAULT_EXTENSIONS
    };

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
        // instead of a binPath array, for top-level-only bins).
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
            try {
                await fs.promises.access(watch.folder, fs.constants.R_OK);
            } catch (err) {
                log(`"${watch.binLabel}": can't read folder (${err.message})`);
                return;
            }

            const found = (await walkDir(watch.folder, "")).filter((f) => isAllowed(f.name));

            const prevPending = pendingSizes[watch.id] || {};
            const nextPending = {};
            const readyByDir = {}; // relDir -> [filenames]

            await Promise.all(
                found.map(async (f) => {
                    const key = f.relDir ? path.join(f.relDir, f.name) : f.name;
                    try {
                        const stats = await fs.promises.stat(path.join(watch.folder, f.relDir, f.name));
                        const prev = prevPending[key];
                        if (prev && prev.size === stats.size) {
                            if (!readyByDir[f.relDir]) readyByDir[f.relDir] = [];
                            readyByDir[f.relDir].push(f.name);
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
                importReady(
                    watch,
                    readyByDir[relDir],
                    path.join(watch.folder, relDir),
                    watch.binPath.concat(subSegments)
                );
            });
        } finally {
            pollingInProgress[watch.id] = false;
        }
    }

    function importReady(watch, filenames, folder, binPath) {
        const binLabel = binPath.join(" / ");
        // A single JSON payload, JSON.stringify'd exactly once for the
        // ExtendScript call, rather than nesting JSON.stringify calls for
        // each argument - fewer levels of escaping means fewer ways for the
        // generated script text to end up malformed.
        const payload = JSON.stringify({ folder, files: filenames, binPath });
        const script = `pbw_importFiles(${JSON.stringify(payload)})`;

        evalScript(script, (result) => {
            try {
                const parsed = JSON.parse(result);
                if (parsed.success && parsed.imported && parsed.imported.length) {
                    log(`Imported into "${binLabel}": ${parsed.imported.join(", ")}`);
                } else if (!parsed.success) {
                    log(`Import failed for "${binLabel}": ${parsed.error || "unknown error"}`);
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
            item.innerHTML = `
                <div class="top">
                    <div>
                        <span class="status-dot ${w.enabled ? "status-on" : "status-off"}"></span>
                        <span class="bin-name">${escapeHtml(w.binLabel)}</span>
                    </div>
                    <div class="actions">
                        <button data-action="toggle" data-id="${w.id}">${w.enabled ? "Pause" : "Resume"}</button>
                        <button data-action="remove" data-id="${w.id}" class="danger">Remove</button>
                    </div>
                </div>
                <div class="folder" title="${escapeHtml(w.folder)}">${escapeHtml(w.folder)}</div>
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

    document.getElementById("addBtn").addEventListener("click", () => {
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
        const watch = { id: uid(), folder: selectedFolder, binPath, binLabel, enabled: true };
        state.watches.push(watch);
        saveState();
        render();
        startWatch(watch);
        log(`Watching "${selectedFolder}" -> bin "${binLabel}"`);

        selectedFolder = "";
        updateFolderLabel();
        document.getElementById("newBinNameInput").value = "";
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
            state.watches = state.watches.filter((w) => w.id !== id);
            saveState();
            render();
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

    // ---- init ----

    log(`Bin Watcher starting... (build ${APP_VERSION})`);
    loadState();
    document.getElementById("pollInput").value = state.pollSeconds;
    document.getElementById("extInput").value = state.extensions;
    render();
    restartAllTimers();
    refreshBins();
    log("Bin Watcher ready.");
})();

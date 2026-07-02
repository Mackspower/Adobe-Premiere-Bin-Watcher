// Bin Watcher panel logic. Runs in the CEP panel's page context with Node
// integration enabled (see manifest.xml: --enable-nodejs --mixed-context).

const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), "PremiereBinWatcher");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_EXTENSIONS =
    "mp4,mov,mxf,avi,mkv,braw,r3d,ari,dpx,mp3,wav,aif,aiff,m4a,jpg,jpeg,png,tif,tiff,psd,gif";

let state = {
    watches: [], // { id, folder, bin, enabled }
    pollSeconds: 3,
    extensions: DEFAULT_EXTENSIONS
};

// In-memory only: filename -> { size } per watch, used to detect that a file
// has finished copying (its size stopped changing between two polls).
const pendingSizes = {};
const timers = {};

function evalScript(script, cb) {
    window.PBW.evalScript(script, cb);
}

function log(msg) {
    const el = document.getElementById("log");
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = `[${time}] ${msg}`;
    el.insertBefore(line, el.firstChild);
    while (el.childNodes.length > 200) el.removeChild(el.lastChild);
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

function pollWatch(watch) {
    fs.readdir(watch.folder, { withFileTypes: true }, (err, entries) => {
        if (err) {
            log(`"${watch.bin}": can't read folder (${err.message})`);
            return;
        }

        const files = entries
            .filter((e) => e.isFile())
            .map((e) => e.name)
            .filter(isAllowed);

        const prevPending = pendingSizes[watch.id] || {};
        const nextPending = {};
        const ready = [];

        if (files.length === 0) {
            pendingSizes[watch.id] = nextPending;
            return;
        }

        let remaining = files.length;
        files.forEach((name) => {
            fs.stat(path.join(watch.folder, name), (statErr, stats) => {
                if (!statErr) {
                    const prev = prevPending[name];
                    if (prev && prev.size === stats.size) {
                        ready.push(name);
                    } else {
                        nextPending[name] = { size: stats.size };
                    }
                }
                remaining--;
                if (remaining === 0) {
                    pendingSizes[watch.id] = nextPending;
                    if (ready.length > 0) importReady(watch, ready);
                }
            });
        });
    });
}

function importReady(watch, filenames) {
    const script = `pbw_importFiles(${JSON.stringify(watch.folder)}, ${JSON.stringify(
        JSON.stringify(filenames)
    )}, ${JSON.stringify(watch.bin)})`;

    evalScript(script, (result) => {
        try {
            const parsed = JSON.parse(result);
            if (parsed.success && parsed.imported && parsed.imported.length) {
                log(`Imported into "${watch.bin}": ${parsed.imported.join(", ")}`);
            } else if (!parsed.success) {
                log(`Import failed for "${watch.bin}": ${parsed.error || "unknown error"}`);
            }
        } catch (e) {
            log(`Unexpected response for "${watch.bin}": ${result}`);
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
                    <span class="bin-name">${escapeHtml(w.bin)}</span>
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
    evalScript("pbw_selectFolder()", (result) => {
        if (result) {
            selectedFolder = result;
            updateFolderLabel();
        }
    });
});

document.getElementById("addBtn").addEventListener("click", () => {
    const binName = document.getElementById("binNameInput").value.trim();
    if (!selectedFolder) {
        log("Pick a folder before adding a watch.");
        return;
    }
    if (!binName) {
        log("Enter a bin name before adding a watch.");
        return;
    }

    const watch = { id: uid(), folder: selectedFolder, bin: binName, enabled: true };
    state.watches.push(watch);
    saveState();
    render();
    startWatch(watch);
    log(`Watching "${selectedFolder}" -> bin "${binName}"`);

    selectedFolder = "";
    updateFolderLabel();
    document.getElementById("binNameInput").value = "";
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

loadState();
document.getElementById("pollInput").value = state.pollSeconds;
document.getElementById("extInput").value = state.extensions;
render();
restartAllTimers();
log("Bin Watcher ready.");

// ExtendScript host code for Bin Watcher.
// Runs inside Premiere Pro's ExtendScript engine (invoked via CSInterface.evalScript from the panel).
//
// ExtendScript doesn't ship a JSON object by default (it's an ES3-era engine;
// whether JSON exists depends on whether some other panel happened to load
// it into the shared engine first). Since this file leans on JSON.parse/
// JSON.stringify throughout, we pull in Douglas Crockford's reference
// polyfill, which no-ops if a native JSON already exists.
#include "json2.js"

/**
 * Walks the project's bin tree and returns every bin as a path (array of
 * names from the project root down to that bin), e.g. ["Footage", "Day1"].
 * Used to populate the "pick an existing bin" dropdown in the panel.
 */
function pbw_listBins() {
    var result = [];
    try {
        function walk(item, trail) {
            for (var i = 0; i < item.children.numItems; i++) {
                var child = item.children[i];
                if (child.type === ProjectItemType.BIN) {
                    var path = trail.concat([child.name]);
                    result.push(path);
                    walk(child, path);
                }
            }
        }
        walk(app.project.rootItem, []);
    } catch (e) {
        result = [];
    }
    return JSON.stringify(result);
}

/**
 * Resolves a bin path (array of names, root-to-leaf) to a ProjectItem,
 * creating any missing bins along the way when createIfMissing is true.
 */
function pbw_resolveBinPath(pathArray, createIfMissing) {
    var current = app.project.rootItem;
    for (var i = 0; i < pathArray.length; i++) {
        var name = pathArray[i];
        var found = null;
        for (var j = 0; j < current.children.numItems; j++) {
            var child = current.children[j];
            if (child.type === ProjectItemType.BIN && child.name === name) {
                found = child;
                break;
            }
        }
        if (!found) {
            if (!createIfMissing) return null;
            found = current.createBin(name);
        }
        current = found;
    }
    return current;
}

/**
 * Returns the OS path separator implied by a given folder path.
 */
function pbw_sepFor(folderPath) {
    return folderPath.indexOf("\\") !== -1 ? "\\" : "/";
}

/**
 * Imports files into a bin, given a single JSON-encoded payload:
 *   { folder: "C:\\path\\to\\watched\\folder",
 *     files: ["a.jpg", "b.mov"],
 *     binPath: ["Footage", "Day1"] }
 * (binPath is root-to-leaf - see pbw_resolveBinPath). Files already present
 * in the bin (matched by project item name) are skipped, so this is safe to
 * call repeatedly with overlapping file lists.
 *
 * Returns a JSON string: { success: bool, imported: [names], error: string }
 */
function pbw_importFiles(payloadJSON) {
    var result = { success: true, imported: [], error: "" };
    try {
        var payload = JSON.parse(payloadJSON);
        var folderPath = payload.folder;
        var fileNames = payload.files;
        var binPath = payload.binPath;
        var bin = pbw_resolveBinPath(binPath, true);

        var existing = {};
        for (var i = 0; i < bin.children.numItems; i++) {
            existing[bin.children[i].name] = true;
        }

        var sep = pbw_sepFor(folderPath);
        var base = folderPath;
        if (base.charAt(base.length - 1) !== sep) {
            base = base + sep;
        }

        var toImportPaths = [];
        var toImportNames = [];
        for (var j = 0; j < fileNames.length; j++) {
            var name = fileNames[j];
            if (!existing[name]) {
                toImportPaths.push(base + name);
                toImportNames.push(name);
            }
        }

        if (toImportPaths.length > 0) {
            var ok = app.project.importFiles(toImportPaths, true, bin, false);
            result.success = ok;
        }
        result.imported = toImportNames;
    } catch (e) {
        result.success = false;
        result.error = e.toString();
    }
    return JSON.stringify(result);
}

/**
 * Opens a native folder picker and returns the chosen path (or "" if cancelled).
 * Note: this dialog can open behind Premiere's main window - if it seems like
 * nothing happened, try Alt+Tab.
 */
function pbw_selectFolder() {
    var f = Folder.selectDialog("Select the folder to watch");
    if (f) {
        return f.fsName;
    }
    return "";
}

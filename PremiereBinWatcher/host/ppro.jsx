// ExtendScript host code for Bin Watcher.
// Runs inside Premiere Pro's ExtendScript engine (invoked via CSInterface.evalScript from the panel).

/**
 * Finds a top-level bin by name under the project root, creating it if it doesn't exist.
 */
function pbw_findOrCreateBin(binName) {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var item = root.children[i];
        if (item.type === ProjectItemType.BIN && item.name === binName) {
            return item;
        }
    }
    return root.createBin(binName);
}

/**
 * Returns the OS path separator implied by a given folder path.
 */
function pbw_sepFor(folderPath) {
    return folderPath.indexOf("\\") !== -1 ? "\\" : "/";
}

/**
 * Imports the given file names (found in folderPath) into the named bin.
 * Files already present in the bin (matched by project item name) are skipped,
 * so this is safe to call repeatedly with overlapping lists.
 *
 * fileNamesJSON: a JSON-encoded array of file names (not full paths).
 * Returns a JSON string: { success: bool, imported: [names], error: string }
 */
function pbw_importFiles(folderPath, fileNamesJSON, binName) {
    var result = { success: true, imported: [], error: "" };
    try {
        var fileNames = JSON.parse(fileNamesJSON);
        var bin = pbw_findOrCreateBin(binName);

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
 */
function pbw_selectFolder() {
    var f = Folder.selectDialog("Select the folder to watch");
    if (f) {
        return f.fsName;
    }
    return "";
}

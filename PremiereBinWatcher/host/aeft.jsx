// After Effects-specific ExtendScript implementation for Bin Watcher.
// #include'd by dispatch.jsx (the file the manifest actually loads), which
// routes to these pbw_aeft_* functions when running inside After Effects and
// to ppro.jsx's pbw_ppro_* equivalents when running inside Premiere - see
// dispatch.jsx for the routing and the shared public pbw_* function names
// the client panel actually calls.
//
// Same JSON contracts as ppro.jsx throughout, so the client panel needs zero
// host-specific logic - it just calls pbw_listBins()/pbw_importFiles()/etc.
// and gets the same shapes back regardless of which host is running.
//
// The two hosts model project organization differently: Premiere's bins are
// a real tree (each bin has its own .children collection). After Effects'
// Project panel is a flat list of items (app.project.item(1..numItems))
// where folders (FolderItem) only imply nesting via each item's
// .parentFolder pointer back to another FolderItem (or app.project.rootFolder
// for top-level items) - so "walking the tree" here means grouping that flat
// list by .parentFolder instead of recursing into a .children collection.
#include "json2.js"

/**
 * Returns the OS path separator implied by a given folder path.
 */
function pbw_aeft_sepFor(folderPath) {
    return folderPath.indexOf("\\") !== -1 ? "\\" : "/";
}

/**
 * Walks the project's folder structure and returns every folder as a path
 * (array of names from the project root down to that folder), e.g.
 * ["Footage", "Day1"]. Used to populate the "pick an existing bin" dropdown
 * in the panel (After Effects calls these "folders", but the panel's own
 * wording/UI already adapts - see IS_AFTER_EFFECTS in client/app.js).
 */
function pbw_aeft_listBins() {
    var result = [];
    try {
        function childFoldersOf(folder) {
            var kids = [];
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if (it instanceof FolderItem && it.parentFolder === folder) kids.push(it);
            }
            return kids;
        }
        function walk(folder, trail) {
            var kids = childFoldersOf(folder);
            for (var k = 0; k < kids.length; k++) {
                var path = trail.concat([kids[k].name]);
                result.push(path);
                walk(kids[k], path);
            }
        }
        walk(app.project.rootFolder, []);
    } catch (e) {
        result = [];
    }
    return JSON.stringify(result);
}

/**
 * Resolves a folder path (array of names, root-to-leaf) to a FolderItem,
 * creating any missing folders along the way when createIfMissing is true.
 */
function pbw_aeft_resolveBinPath(pathArray, createIfMissing) {
    var current = app.project.rootFolder;
    for (var i = 0; i < pathArray.length; i++) {
        var name = pathArray[i];
        var found = null;
        for (var j = 1; j <= app.project.numItems; j++) {
            var it = app.project.item(j);
            if (it instanceof FolderItem && it.parentFolder === current && it.name === name) {
                found = it;
                break;
            }
        }
        if (!found) {
            if (!createIfMissing) return null;
            found = app.project.items.addFolder(name);
            found.parentFolder = current;
        }
        current = found;
    }
    return current;
}

/**
 * Imports files into a folder, given the same JSON-encoded payload shape as
 * ppro.jsx's pbw_ppro_importFiles - see that file for the full field list.
 *
 * Unlike Premiere's single batch importFiles() call, After Effects imports
 * one file at a time (app.project.importFile), so failures are per-file:
 * a file that fails to import is simply left out of `imported`/`present`
 * (and noted in `error`) so it gets retried on the next poll, instead of
 * aborting the whole batch the way a Premiere-side failure would.
 *
 * importAsNumberedStills: sets ImportOptions.sequence = true, After Effects'
 * equivalent of Premiere's importAsNumberedStills - given the first frame of
 * a numbered sequence, it imports the whole run as one footage item.
 *
 * labelColorIndex: same 0-15 range the client always sends (matching
 * Premiere's setColorLabel range) - After Effects' Item.label property uses
 * 1-16 with 0 reserved for "no label", so this is offset by +1 here. Because
 * After Effects lets each user rename/recolor all 16 labels in their own
 * Preferences, the client shows generic "Label 1".."Label 16" for this host
 * instead of Premiere's fixed color names - see LABEL_COLORS in app.js.
 */
function pbw_aeft_importFiles(payloadJSON) {
    var result = { success: true, imported: [], present: [], error: "" };
    try {
        var payload = JSON.parse(payloadJSON);
        var folderPath = payload.folder;
        var fileNames = payload.files;
        var binPath = payload.binPath;
        var importAsNumberedStills = !!payload.importAsNumberedStills;
        var labelColorIndex = (typeof payload.labelColorIndex === "number") ? payload.labelColorIndex : null;
        var targetFolder = pbw_aeft_resolveBinPath(binPath, true);

        var existing = {};
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it.parentFolder === targetFolder) existing[it.name] = true;
        }

        var sep = pbw_aeft_sepFor(folderPath);
        var base = folderPath;
        if (base.charAt(base.length - 1) !== sep) {
            base = base + sep;
        }

        var toImportNames = [];
        var present = [];
        var failedNames = [];
        for (var j = 0; j < fileNames.length; j++) {
            var name = fileNames[j];
            if (existing[name]) {
                present.push(name);
            } else {
                toImportNames.push(name);
            }
        }

        for (var k = 0; k < toImportNames.length; k++) {
            var importName = toImportNames[k];
            try {
                var io = new ImportOptions(File(base + importName));
                if (importAsNumberedStills) io.sequence = true;
                var newItem = app.project.importFile(io);
                newItem.parentFolder = targetFolder;
                if (labelColorIndex !== null) {
                    try {
                        newItem.label = labelColorIndex + 1;
                    } catch (labelErr) {
                        // Non-fatal - the import itself already succeeded.
                    }
                }
                result.imported.push(importName);
                present.push(importName);
            } catch (importErr) {
                // Left out of `present` on purpose, so it's retried on the
                // next poll instead of silently dropped.
                failedNames.push(importName);
            }
        }

        if (failedNames.length) {
            result.error = "Couldn't import: " + failedNames.join(", ");
        }
        result.present = present;
    } catch (e) {
        result.success = false;
        result.error = e.toString();
    }
    return JSON.stringify(result);
}

/**
 * Returns the path to the currently open/saved project file, or "" if the
 * project hasn't been saved yet. Used to resolve watches stored as a path
 * relative to the project file.
 */
function pbw_aeft_getProjectPath() {
    try {
        return (app.project.file && app.project.file.fsName) || "";
    } catch (e) {
        return "";
    }
}

/**
 * Opens a native folder picker and returns the chosen path (or "" if cancelled).
 * Note: this dialog can open behind After Effects' main window - if it seems
 * like nothing happened, try Alt+Tab.
 */
function pbw_aeft_selectFolder() {
    var f = Folder.selectDialog("Select the folder to watch");
    if (f) {
        return f.fsName;
    }
    return "";
}

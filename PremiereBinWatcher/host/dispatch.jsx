// Entry point loaded by the CEP manifest (see CSXS/manifest.xml's
// <ScriptPath>) for BOTH Premiere Pro and After Effects - a single Extension
// with both hosts listed shares one ScriptPath in CEP's manifest schema, so
// there's no manifest-level way to point each host at its own .jsx file.
// Instead, this file #includes both host-specific implementations and picks
// between them at runtime with pbw_isAfterEffects() below, then re-exposes
// one set of public pbw_* functions - the only names the client panel
// (client/app.js) ever calls via evalScript. ppro.jsx/aeft.jsx's own
// functions are namespaced pbw_ppro_*/pbw_aeft_* precisely so both can be
// #included into this one engine without colliding.
#include "ppro.jsx"
#include "aeft.jsx"

// FolderItem only exists in After Effects' ExtendScript DOM - a safe,
// self-verifying way to detect the host, since if it's present, the
// AE-specific code in aeft.jsx that uses it is guaranteed to work. `typeof`
// never throws for an undeclared identifier, so this needs no try/catch.
function pbw_isAfterEffects() {
    return typeof FolderItem !== "undefined";
}

function pbw_listBins() {
    return pbw_isAfterEffects() ? pbw_aeft_listBins() : pbw_ppro_listBins();
}

function pbw_importFiles(payloadJSON) {
    return pbw_isAfterEffects() ? pbw_aeft_importFiles(payloadJSON) : pbw_ppro_importFiles(payloadJSON);
}

function pbw_getProjectPath() {
    return pbw_isAfterEffects() ? pbw_aeft_getProjectPath() : pbw_ppro_getProjectPath();
}

function pbw_selectFolder() {
    return pbw_isAfterEffects() ? pbw_aeft_selectFolder() : pbw_ppro_selectFolder();
}

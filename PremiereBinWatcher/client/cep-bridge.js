// Minimal bridge to the CEP host environment. We intentionally avoid pulling in
// Adobe's full CSInterface.js since the panel only needs evalScript().
(function () {
    function evalScript(script, callback) {
        try {
            window.__adobe_cep__.evalScript(script, function (result) {
                if (typeof callback === "function") callback(result);
            });
        } catch (e) {
            if (typeof callback === "function") {
                callback(JSON.stringify({ success: false, error: String(e) }));
            }
        }
    }

    // Which Adobe app this panel is running in ("PPRO", "AEFT", or "" if
    // unavailable) - lets the panel adapt small bits of wording (e.g.
    // Premiere's "bins" vs After Effects' "folders") without needing any
    // host-specific logic beyond that.
    function hostAppId() {
        try {
            const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
            return (env && env.appId) || "";
        } catch (e) {
            return "";
        }
    }

    window.PBW = window.PBW || {};
    window.PBW.evalScript = evalScript;
    window.PBW.hostAppId = hostAppId;
})();

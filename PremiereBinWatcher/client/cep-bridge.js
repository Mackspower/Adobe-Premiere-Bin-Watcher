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

    window.PBW = window.PBW || {};
    window.PBW.evalScript = evalScript;
})();

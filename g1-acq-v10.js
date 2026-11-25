"use strict";
(function () {
  var VERSION = "g1-acq-v10";
  var REPL = { "g1.ios.30tb.ai.pro.m": "g1.ai.ultra.1month_eft.acq" };
  var FALLBACK = { "g1.ai.ultra.1month_eft.acq": "g1.ai.ultra.3months_ip_90p.acq" };
  var LOG_KEY = "g1.rpc.log.v10";
  var url = ($request && $request.url) || "";
  var isReq = !(typeof $response === "object" && $response);

  // ---- respond to report page ----
 if (url.indexOf("g1-sku-report") !== -1) {
    var d = "{}";
    try { d = $persistentStore.read(LOG_KEY) || "{}"; } catch (e) {}
    $done({ body: d });
    return;
  }

  var body = isReq ? $request.body : ($response ? $response.body : undefined);
  if (typeof body !== "string" || body.length < 10) { $done({}); return; }

  // ---- response safety: only touch JSON/HTML/JS ----
  if (!isReq) {
    var ct = "";
    try {
      var h = $response.headers || {};
      ct = h["Content-Type"] || h["content-type"] || "";
    } catch (e) {}
    if (!/json|html|javascript|text/i.test(ct)) { $done({}); return; }
  }

  try {
    // escape-aware normalization
    var norm = body.replace(/\\u002e|%2E/gi, ".");

    // log snippet for diagnosis
    try {
      var log = JSON.parse($persistentStore.read(LOG_KEY) || "[]");
      log.push({ t: new Date().toISOString(), m: isReq ? "REQ" : "RES",
                 u: url.substring(0, 120), s: norm.substring(0, 300) });
      $persistentStore.write(JSON.stringify(log.slice(-30)), LOG_KEY);
    } catch (e) {}

    // what tokens actually exist in this body
    var obs = {}, mm, re = /g1\.[A-Za-z0-9_.-]{2,120}/g;
    while ((mm = re.exec(norm)) !== null) obs[mm[0]] = 1;

    // rewrite
    var hits = 0;
    var out = norm.replace(re, function (id) {
      var to = REPL[id];
      if (!to) return id;
      if (!obs[to] && FALLBACK[to] && obs[FALLBACK[to]]) to = FALLBACK[to];
      hits++;
      return to;
    });

    console.log("[g1-v10] " + (isReq ? "REQ" : "RES") + " hits=" + hits);
    $done(hits ? { body: out } : {});
  } catch (err) {
    console.log("[g1-v10] error passthrough");
    $done({});   // NEVER modify on error — page stays intact
  }
})();

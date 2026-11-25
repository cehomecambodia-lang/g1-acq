"use strict";
(function () {
  var VERSION = "g1-acq-v9.0";
  var LOG_KEY = "g1.rpc.log.v9";
  var TARGET = "g1.ai.ultra.1month_eft.acq";
  var REPLACEMENTS = { "g1.ios.30tb.ai.pro.m": TARGET };
  var url = ($request && $request.url) || "";
  if (!/^https:\/\/one\.google\.com\//.test(url)) { $done({}); return; }
  var isReq = !(typeof $response === "object" && $response);
  var body = isReq ? $request.body : $response.body;
  if (typeof body !== "string" || !body) { $done({}); return;

  }
  // ---- normalize escaped dots BEFORE any logic ----
  var norm = body.replace(/\\u002e|%2E|&#0*46;/gi, ".");
  // ---- RPC logging (tells us WHAT fails at purchase time) ----
  try {
    var rpcMatch = url.match(/data\/batchexecute.*?rpcids=([^&]+)/) ||
                   norm.match(/"(f\.?[A-Za-z0-9$_]{4,30})"/);
    var rpc = rpcMatch ? rpcMatch[1] : "unknown-rpc";
    var log = JSON.parse($persistentStore.read(LOG_KEY) || "[]");
    log.push({ t: new Date().toISOString(), m: isReq ? "REQ" : "RES",
               rpc: rpc, snippet: norm.substring(0, 400) });
    $persistentStore.write(JSON.stringify(log.slice(-40)), LOG_KEY);
  } catch (e) {}
  // ---- rewrite SKUs (now dot-escape aware) ----
  var hits = 0;
  var out = norm.replace(/g1\.[A-Za-z0-9._-]{2,120}/g, function (id) {
    if (REPLACEMENTS[id]) { hits++; return REPLACEMENTS[id]; }
    return id;
  });
  // ---- flip trial-eligibility booleans in responses ----
  if (!isReq) {
    out = out.replace(/"trialEligible"\s*:\s*false/g, '"trialEligible":true')
             .replace(/"eligible"\s*:\s*false/g, '"eligible":true');
  }
  console.log("[g1-v9] " + (isReq ? "REQ" : "RES") + " hits=" + hits);
  $done(hits || out !== norm ? { body: out } : {});
})();

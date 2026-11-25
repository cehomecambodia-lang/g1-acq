"use strict";

(function () {
  var VERSION = "g1-acq-v8.1";
  var SKU_MAP = {
    "g1.ios.30tb.ai.pro.m": "g1.ai.ultra.1month_eft.acq"
  };
  var FALLBACK = {
    "g1.ai.ultra.1month_eft.acq": "g1.ai.ultra.3months_ip_90p.acq"
  };
  var SCAN_KEY = "g1.sku.scan.v81";
  var TOKEN_RE = /(g1(?:\.|%2E|\u005cu002e)[A-Za-z0-9._%-]{2,120})/gi;

  var url = (typeof $request === "object" && $request && $request.url) || "";
  if (!/^https:\/\/one\.google\.com\//.test(url)) { $done({}); return; }

  var isRequest = !(typeof $response === "object" && $response);

  // ---- built-in report page: visit https://one.google.com/g1-sku-report in Safari ----
  if (isRequest && /^https:\/\/one\.google\.com\/g1-sku-report/.test(url)) {
    var dump = "{}";
    try { dump = $persistentStore.read(SCAN_KEY) || "{}"; } catch (e) {}
    $done({
      response: {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: dump
      }
    });
    return;
  }

  var body = isRequest ? $request.body : $response.body;
  if (typeof body !== "string" || !body) { $done({}); return; }

  try { scan(body); } catch (e) {}

  // snapshot of tokens actually present, drives the fallback decision
  var observed = {}, m;
  while ((m = TOKEN_RE.exec(body)) !== null) observed[m[1]] = true;
  TOKEN_RE.lastIndex = 0;

  var counts = {}, hits = 0;
  var out = body.replace(TOKEN_RE, function (full, id) {
    if (!Object.prototype.hasOwnProperty.call(SKU_MAP, id)) return full;
    var to = SKU_MAP[id];
    if (!observed[to] && FALLBACK[to] && observed[FALLBACK[to]]) to = FALLBACK[to];
    counts[id] = (counts[id] || 0) + 1;
    hits++;
    return to;
  });
  TOKEN_RE.lastIndex = 0;

  console.log("[g1-acq] " + VERSION + " mode=" + (isRequest ? "REQ" : "RES") + " hits=" + hits);
  Object.keys(counts).forEach(function (k) {
    console.log("[g1-acq] " + k + " -> " + counts[k] + "x");
  });

  $done(hits ? { body: out } : {});

  function scan(text) {
    var now = new Date().toISOString(), state;
    try { state = JSON.parse($persistentStore.read(SCAN_KEY) || "{}"); } catch (e) { state = null; }
    if (!state || state.schemaVersion !== 1) state = { schemaVersion: 1, skus: {} };
    if (!state.skus) state.skus = {};
    var row, changed = false;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      row = state.skus[m[1]];
      if (!row) { row = { count: 0, firstSeen: now }; changed = true; }
      row.count++; row.lastSeen = now;
      state.skus[m[1]] = row;
    }
    TOKEN_RE.lastIndex = 0;
    if (changed) {
      state.updatedAt = now;
      state.version = VERSION;
      try { $persistentStore.write(JSON.stringify(state), SCAN_KEY); } catch (e) {}
    }
  }
})();

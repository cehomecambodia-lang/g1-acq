/**
 * g1-ultra · Shadowrocket Response Rewrite + Remote Diagnostics (USD Edition)
 *
 * Changes:
 *  1. Currency forced to USD via scoped price rewrite
 *  2. NEW: 30TB plan forced to $19.99 (scoped to its SKU, not global)
 *  3. CURRENCY / MICROS diagnostics kept for pairing SKUs with prices
 */
"use strict";

/* ============ 0. Switches ============ */
var DIAG = true;
var REPORT_URL = "https://webhook.site/bad67ff2-2c22-4d6d-bfba-ecb841296843";

/* ============ 1. String Replacements (SKU mapping) ============ */
var REPLACE = [
  ["g1.ios.20tb.m.v2", "g1.ios.20tb.m"],
  ["g1.ios.30tb.ai.pro.m", "g1.ios.30tb.m"]
];

/* ============ 2. Scoped Price Rewrites (run BEFORE SKU mapping!) ============
 * Each entry: sku regex -> all price fields within `window` chars AFTER the
 * SKU occurrence get rewritten. Adding entries here is how you set per-plan
 * pricing (e.g. 20TB later).
 * ============================================================================ */
var SCOPED_PRICES = [
  {
    sku:    "g1\\.ios\\.30tb[a-z0-9._-]*",   // matches the 30TB SKU wherever it appears
    window: 600,                              // how far after the SKU to look for price fields
    micros: 19990000,                         // $19.99 (micros: 1 USD = 1000000)
    price:  "US$19.99"                        // display string, in case the body carries formattedPrice
  }
  // ,{ sku: "g1\\.ios\\.20tb[a-z0-9._-]*", window: 600, micros: 9990000, price: "US$9.99" }
];

/* ============ 2b. Global Regex Replacements (optional) ============ */
var REGEX = [
  // Force currency code USD everywhere (safe — affects display only)
  ['"price_currency_code"\\s*:\\s*"[A-Z]{3}"', '"price_currency_code":"USD"'],
  ['"currencyCode"\\s*:\\s*"[A-Z]{3}"',        '"currencyCode":"USD"']
];

/* ============ 3. Reporting ============ */
function report(text) {
  try {
    if (typeof $httpClient === "undefined") {
      console.log("[g1] No $httpClient available, skipping report");
      return;
    }
    $httpClient.post({
      url: REPORT_URL,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: text
    }, function (err, resp, data) {
      console.log("[g1] report -> " + (err ? ("err " + err) : (resp && resp.status)));
    });
  } catch (e) {
    console.log("[g1] report exception " + e);
  }
}

function uniq(arr) {
  var s = {}, o = [];
  for (var i = 0; i < arr.length; i++) if (!s[arr[i]]) { s[arr[i]] = 1; o.push(arr[i]); }
  return o;
}

/* Scoped price engine: find each SKU occurrence, patch price fields in the
 * window behind it, splice the result back into the body. */
function applyScopedPrices(input) {
  var out = input, applied = 0;
  for (var s = 0; s < SCOPED_PRICES.length; s++) {
    var cfg = SCOPED_PRICES[s];
    var re = new RegExp(cfg.sku, "g");
    var guard = 0, m;
    while ((m = re.exec(out)) !== null && guard++ < 50) {
      var start = m.index;
      var end = Math.min(out.length, start + cfg.window);
      var seg = out.slice(start, end);
      var patched = seg;

      if (cfg.micros) {
        patched = patched.replace(
          /("(?:price_amount_micros|priceAmountMicros)"\s*:\s*)"?[0-9]+"?/,
          '$1"' + cfg.micros + '"'
        );
        // Some payloads use bare JSON numbers, not strings — cover that too
        patched = patched.replace(
          /("(?:price_amount_micros|priceAmountMicros)"\s*:\s*)([0-9]+)/,
          '$1"' + cfg.micros + '"'
        );
      }
      if (cfg.price) {
        patched = patched.replace(
          /("(?:formattedPrice|displayPrice)"\s*:\s*")[^"]*(")/,
          '$1' + cfg.price + '$2'
        );
      }

      if (patched !== seg) {
        out = out.slice(0, start) + patched + out.slice(end);
        applied++;
        console.log("[g1] scoped-price " + m[0] + " -> micros=" + cfg.micros +
                    " price=" + (cfg.price || "-"));
        re.lastIndex = 0; // indices shifted after splice — rescan safely
      }
    }
  }
  return { body: out, applied: applied };
}

/* ============ 4. Main Logic ============ */
var body = $response && $response.body;
var url = ($request && $request.url) || "?";

if (!body || typeof body !== "string") {
  console.log("[g1] No body " + url);
  $done({});
} else {
  console.log("[g1] Matched " + url + "  body=" + body.length + "B");

  var summary = ["URL: " + url, "BODY: " + body.length + "B"];
  var hits = 0;

  if (DIAG) {
    var list = body.match(/g1\.[a-z0-9._]{2,40}/g) || [];
    var idStr = uniq(list).join(",") || "(none)";
    var pr = body.match(/[¥$€]|US?\$\s?[0-9][0-9,.]*/g) || [];
    var cur = body.match(/"(?:price_currency_code|currencyCode)"\s*:\s*"[A-Z]{3}"/g) || [];
    var mic = body.match(/"(?:price_amount_micros|priceAmountMicros|priceMicros)"\s*:\s*"?[0-9]+"?/g) || [];

    console.log("[g1] productIds: " + idStr);
    console.log("[g1] prices: " + (pr.join(",") || "(none)"));
    console.log("[g1] currency: " + (cur.join(",") || "(none)"));
    console.log("[g1] micros: " + (mic.join(",") || "(none)"));

    summary.push("IDS: " + idStr);
    summary.push("PRICES: " + (uniq(pr).slice(0, 20).join(",") || "(none)"));
    summary.push("CURRENCY: " + (uniq(cur).join(",") || "(none)"));
    summary.push("MICROS: " + (uniq(mic).slice(0, 40).join(",") || "(none)"));

    if (/g1\.ios\./.test(body)) {
      var re2 = /g1\.ios\.[a-z0-9._]+/g, seen2 = {}, m2, parts = [];
      while ((m2 = re2.exec(body)) !== null) {
        if (seen2[m2[0]]) continue;
        seen2[m2[0]] = 1;
        var seg = body.slice(Math.max(0, m2.index - 180), Math.min(body.length, m2.index + 300));
        parts.push("### " + m2[0] + "\n" + seg);
      }
      summary.push("IAP-SEGMENTS:");
      summary.push(parts.join("\n\n").slice(0, 14000));
    }
  }

  /* --- ORDER MATTERS: scoped prices first, while source SKUs are intact --- */
  var scoped = applyScopedPrices(body);
  body = scoped.body;
  hits += scoped.applied;

  /* --- Generic string replacements --- */
  for (var i = 0; i < REPLACE.length; i++) {
    var from = REPLACE[i][0], to = REPLACE[i][1];
    if (body.indexOf(from) !== -1) {
      var n = body.split(from).length - 1;
      body = body.split(from).join(to);
      hits += n;
      console.log("[g1] " + from + " -> " + to + " x" + n);
    }
  }

  /* --- Global regex replacements --- */
  for (var r = 0; r < REGEX.length; r++) {
    var rx = new RegExp(REGEX[r][0], "g");
    var mm = body.match(rx);
    if (mm) {
      body = body.replace(rx, REGEX[r][1]);
      hits += mm.length;
      console.log("[g1] /" + REGEX[r][0] + "/ x" + mm.length);
    }
  }

  summary.push("HITS: " + hits);
  console.log(hits ? "[g1] Replaced " + hits + " occurrence(s) in total" : "[g1] No rules matched");

  if (DIAG) report(summary.join("\n"));

  $done(hits ? { body: body } : {});
}

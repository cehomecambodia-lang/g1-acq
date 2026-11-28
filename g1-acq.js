/**
 * g1-ultra · Shadowrocket Response Rewrite + Remote Diagnostics (USD Edition)
 *
 * Changes:
 *  1. Added currency/currencyCode rules in REGEX to force USD
 *  2. Added CURRENCY / MICROS output to diagnostics to help pair SKUs with USD prices
 *  3. Reserved a US-SKU mapping section to fill in once real SKUs are captured
 */
"use strict";

/* ============ 0. Switches ============ */
var DIAG = true;
var REPORT_URL = "https://webhook.site/bad67ff2-2c22-4d6d-bfba-ecb841296843";

/* ============ 1. String Replacements (SKU mapping — update here after switching region/account) ============ */
var REPLACE = [
  // Default community preset: strip suffix from Ultra iOS SKUs
  ["g1.ios.20tb.m.v2", "g1.ios.20tb.m"],
  ["g1.ios.30tb.ai.pro.m", "g1.ios.30tb.m"]

  // ↓↓ Once diagnostics confirm the US-region SKUs, remove the entries above and enable mappings like those below ↓↓
  // ["g1.ios.20tb.m.v2", "g1.ios.20tb.m.us"],
  // ["g1.ios.30tb.ai.pro.m", "g1.ios.30tb.m.us"]
];

/* ============ 2. Regex Replacements (Force USD) ============ */
var REGEX = [
  // Normalize currency code to USD (compatible with JSON formats with or without spaces)
  ['"price_currency_code"\\s*:\\s*"[A-Z]{3}"', '"price_currency_code":"USD"'],
  ['"currencyCode"\\s*:\\s*"[A-Z]{3}"',        '"currencyCode":"USD"']

  // Price examples (micros: 1 USD = 1000000)
  // ['"price_amount_micros"\\s*:\\s*[0-9]+', '"price_amount_micros":19990000']  // $19.99
  // ['"formattedPrice":"[^"]*"','"formattedPrice":"US$19.99"']
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

/* ============ 4. Main Logic ============ */
var body = $response && $response.body;
var url = ($request && $request.url) || "?";

if (!body || typeof body !== "string") {
  console.log("[g1] No body " + url);
  $done({});
} else {
  console.log("[g1] Matched " + url + "  body=" + body.length + "B");

  var summary = ["URL: " + url, "BODY: " + body.length + "B"];

  if (DIAG) {
    var list = body.match(/g1\.[a-z0-9._]{2,40}/g) || [];
    var idStr = uniq(list).join(",") || "(none)";

    var pr = body.match(/[¥$€]|US?\$\s?[0-9][0-9,.]*/g) || [];

    // Added: currency codes + micros, used to pair SKUs with USD pricing
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

    // iOS IAP products: slice surrounding text around each g1.ios.* match to pair it with its price
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

  var hits = 0, i;

  for (i = 0; i < REPLACE.length; i++) {
    var from = REPLACE[i][0], to = REPLACE[i][1];
    if (body.indexOf(from) !== -1) {
      var n = body.split(from).length - 1;
      body = body.split(from).join(to);
      hits += n;
      console.log("[g1] " + from + " -> " + to + " x" + n);
    }
  }

  for (i = 0; i < REGEX.length; i++) {
    var rx = new RegExp(REGEX[i][0], "g");
    var m = body.match(rx);
    if (m) {
      body = body.replace(rx, REGEX[i][1]);
      hits += m.length;
      console.log("[g1] /" + REGEX[i][0] + "/ x" + m.length);
    }
  }

  summary.push("HITS: " + hits);
  console.log(hits ? "[g1] Replaced " + hits + " occurrence(s) in total" : "[g1] No rules matched");

  if (DIAG) report(summary.join("\n"));

  $done(hits ? { body: body } : {});
}

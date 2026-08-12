/* ============================================================
   Margin of Safety — ChatGPT widget.

   Rendered in an iframe inside the conversation. Reads the
   completed worksheet from window.openai.toolInput (the arguments
   the model passed to the tool), recomputes every value client
   side, and lets the user argue with the assumptions.

   widgetMain is serialised with Function.prototype.toString() and
   inlined into the HTML resource, so it must not reference
   anything outside its own body.
   ============================================================ */

export const WIDGET_CSS = `
:root{
  /* color-scheme must follow the same signal as the tokens: the theme comes
     from window.openai.theme, and letting the OS pick the canvas instead
     paints dark ink on a dark ground for viewers whose OS and ChatGPT themes
     disagree. Bound to data-theme below. */
  color-scheme: light;
  /* Purpose-built for the ChatGPT surface: no panels, no fills, no ground of
     its own. Structure comes from hairlines and spacing; the only pigment is
     the scenario palette, one amber highlight, and red/green verdicts. Every
     neutral is a translucent overlay so it reads on whatever ChatGPT paints
     underneath. */
  --ink:#1a1e23; --sub:#69727c;
  --rule:rgba(0,0,0,.16); --rule-soft:rgba(0,0,0,.08);
  --raise:rgba(0,0,0,.04); --track:rgba(0,0,0,.07);
  --hilite:rgba(214,168,32,.18); --hilite-ink:#5c4708;
  --market:#a3372a; --good:#1a6f5e;
  --s1:#98a1ab; --s2:#5d7d90; --s3:#2f6a6a; --s4:#3f7d52; --s5:#b8862c;
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --ink:#ececf1; --sub:#9aa3af;
  --rule:rgba(255,255,255,.18); --rule-soft:rgba(255,255,255,.10);
  --raise:rgba(255,255,255,.05); --track:rgba(255,255,255,.09);
  --hilite:rgba(226,184,66,.20); --hilite-ink:#f0d691;
  --market:#e78b7b; --good:#6fc39c;
  --s1:#7d8794; --s2:#7fa3b8; --s3:#5fae9f; --s4:#79b98d; --s5:#d7a955;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --ink:#ececf1; --sub:#9aa3af;
    --rule:rgba(255,255,255,.18); --rule-soft:rgba(255,255,255,.10);
    --raise:rgba(255,255,255,.05); --track:rgba(255,255,255,.09);
    --hilite:rgba(226,184,66,.20); --hilite-ink:#f0d691;
    --market:#e78b7b; --good:#6fc39c;
    --s1:#7d8794; --s2:#7fa3b8; --s3:#5fae9f; --s4:#79b98d; --s5:#d7a955;
  }
}
:root[data-theme="light"]{ color-scheme: light; }
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:transparent; color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:14px; line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.wrap{padding:2px 1px}
.mono{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace}

/* ---- header ---- */
.eyebrow{font-size:10.5px;letter-spacing:.14em;color:var(--sub);margin-bottom:5px}
.title{font-size:19px;font-weight:650;letter-spacing:-.01em;margin:0;text-wrap:balance}
.meta{font-size:12px;color:var(--sub);margin-top:3px}

/* ---- verdict ---- */
.hero{margin:16px 0 4px}
.hero-row{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.ev-label{font-size:10.5px;letter-spacing:.14em;color:var(--sub)}
.ev-num{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:30px;
  font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.ev-vs{font-size:12.5px;color:var(--sub)}
.ev-vs b{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-variant-numeric:tabular-nums}
.tape-track{position:relative;height:24px;overflow:hidden;border-radius:6px;
  background:var(--track);margin-top:10px}
.tape-fill{position:absolute;inset:0;display:flex}
.tape-seg{height:100%;transition:width .3s}
.tape-mark{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--market)}
.tape-legend{display:flex;justify-content:space-between;gap:8px;margin-top:6px;flex-wrap:wrap}
.tape-keys{display:flex;flex-wrap:wrap;gap:3px 12px}
.tape-key{font-size:10.5px;color:var(--sub);display:flex;align-items:center;gap:4px}
.tape-key b{font-family:ui-monospace,Menlo,monospace;font-weight:600;color:var(--ink);
  font-variant-numeric:tabular-nums}
.tape-swatch{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none}
.tape-marklabel{font-size:10.5px;font-weight:600;color:var(--market)}

/* ---- controls ---- */
.controls{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;
  flex-wrap:wrap;margin:16px 0 4px}
.presets{display:flex;gap:6px;flex-wrap:wrap}
.btn{padding:4px 12px;font-size:12px;border:1px solid var(--rule);border-radius:999px;
  background:transparent;color:var(--ink);cursor:pointer;font-family:inherit}
.btn:hover{background:var(--raise)}
.btn:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.k-wrap{flex:1;min-width:180px;max-width:260px}
.slider-row .lab{display:flex;justify-content:space-between;align-items:baseline;
  font-size:11.5px;color:var(--sub)}
.slider-row .val{font-family:ui-monospace,Menlo,monospace;font-weight:600;color:var(--ink);
  font-variant-numeric:tabular-nums}
input[type=range]{width:100%;height:4px;cursor:pointer;margin:5px 0 0;accent-color:var(--ink)}

/* ---- scenarios ---- */
.scen{border-left:3px solid var(--rule);border-radius:1.5px;padding:10px 0 12px 14px;
  margin:12px 0 0;background:transparent}
.scen-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.scen-name{font-weight:650;font-size:13.5px}
.scen-value{font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:600;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.scen-value small{font-weight:400;color:var(--sub);font-family:inherit}
.scen-rule{font-size:11.5px;color:var(--sub);font-style:italic;margin:1px 0 0}
.scen-desc{font-size:12.5px;color:var(--sub);margin:5px 0 9px;max-width:68ch}
.link{font-size:11.5px;color:var(--sub);background:none;border:none;font-family:inherit;
  text-decoration:underline;text-underline-offset:2px;cursor:pointer;padding:0;margin-top:7px}
.link:hover{color:var(--ink)}
.math-box{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:11px;
  line-height:1.6;border:1px solid var(--rule-soft);border-radius:6px;
  padding:7px 9px;margin-top:8px;overflow-x:auto;color:var(--sub)}
.assump-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:9px}
.assump{display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--sub)}
.assump input{width:86px;padding:3px 6px;font-family:ui-monospace,Menlo,monospace;font-size:12px;
  border:1px solid var(--rule);border-radius:5px;background:transparent;color:var(--ink)}

/* ---- sections ---- */
.sect{border-top:1px solid var(--rule-soft);margin-top:18px;padding-top:12px}
.sect-label{font-size:10.5px;letter-spacing:.14em;color:var(--sub);margin-bottom:8px;
  display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ledger-eq{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--sub);
  margin-bottom:7px;word-wrap:break-word;font-variant-numeric:tabular-nums}
.ledger-sum{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--hilite);
  color:var(--hilite-ink);border-radius:5px;display:inline-block;padding:3px 8px;
  font-variant-numeric:tabular-nums}
.ledger-note{font-size:12.5px;color:var(--sub);margin:9px 0 0;max-width:72ch}

/* ---- the three statements ---- */
.fin-unit{font-size:11px;font-family:ui-monospace,Menlo,monospace;letter-spacing:0}
.fin-stmt{margin-top:10px}
.fin-stmt h4{font-size:12px;margin:0 0 3px;font-weight:650}
.fin-scroll{overflow-x:auto}
.fin table{width:100%;border-collapse:collapse;font-size:12px}
.fin th{text-align:right;padding:3px 6px;font-size:10.5px;color:var(--sub);font-weight:400;
  border-bottom:1px solid var(--rule);white-space:nowrap}
.fin th:first-child{text-align:left}
.fin td{padding:3px 6px;border-bottom:1px solid var(--rule-soft);text-align:right;
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;white-space:nowrap}
.fin td:first-child{text-align:left;font-family:inherit}
.fin tr.total td{font-weight:700;border-bottom:none}
.fin .neg{color:var(--market)}

/* ---- notices ---- */
.warn{border:1px solid var(--market);border-radius:8px;padding:8px 11px;margin-bottom:12px;
  font-size:12px;color:var(--market)}
.note{font-size:11.5px;color:var(--sub);margin-bottom:10px}
.note b{color:var(--ink)}

/* ---- full report ---- */
.report{margin-top:6px}
.report h3{font-size:14px;margin:16px 0 5px;font-weight:650}
.report h4{font-size:12.5px;margin:11px 0 3px;font-weight:650}
.report p{font-size:12.5px;margin:5px 0;max-width:76ch}
.report table{width:100%;border-collapse:collapse;font-size:12px;margin:7px 0}
.report th{text-align:left;border-bottom:1px solid var(--ink);padding:4px 5px;font-size:10.5px}
.report td{border-bottom:1px solid var(--rule-soft);padding:5px;vertical-align:top}
.report td.n{text-align:right;font-family:ui-monospace,Menlo,monospace;white-space:nowrap;
  font-variant-numeric:tabular-nums}
.report .mathline{font-family:ui-monospace,Menlo,monospace;font-size:11px;margin:2px 0 2px 10px;
  white-space:pre-wrap;color:var(--sub)}
.report .mathfinal{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:11px;
  background:var(--hilite);color:var(--hilite-ink);border-radius:4px;padding:2px 7px;
  display:inline-block;margin:3px 0 7px 10px}
.report .evrow td{background:var(--hilite);color:var(--hilite-ink);font-weight:700}
.tbl-scroll{overflow-x:auto}
.fine{font-size:11px;color:var(--sub)}
.foot{margin-top:16px;padding-top:10px;border-top:1px solid var(--rule-soft);
  font-size:11px;color:var(--sub)}
.waiting{padding:20px 4px;color:var(--sub);font-size:13px}
@media (prefers-reduced-motion: reduce){.tape-seg{transition:none}}
`;

export function widgetMain() {
  "use strict";

  var root = document.getElementById("mos-root");
  var BASE_YEAR = new Date().getFullYear();
  var state = null;

  /* ---------- helpers ---------- */
  function fmtB(v) {
    if (!isFinite(v)) return "—";
    var sign = v < 0 ? "−" : "";
    v = Math.abs(v);
    if (v >= 1000) return sign + "$" + (v / 1000).toFixed(2) + "T";
    if (v >= 100) return sign + "$" + Math.round(v) + "B";
    if (v >= 10) return sign + "$" + v.toFixed(1) + "B";
    return sign + "$" + v.toFixed(2) + "B";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function scenColor(i) {
    return ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"][i] || "var(--s1)";
  }

  /* ---------- valuation engine ---------- */
  function scenarioValue(s, Kpct) {
    var k = Kpct / 100;
    var years = Math.max(0, (Number(s.year) || BASE_YEAR) - BASE_YEAR);
    var add = Number(s.addBack || 0);
    if (s.type === "nav") return Number(s.value || 0);
    if (s.type === "epv") {
      var F = s.fcf != null ? Number(s.fcf)
        : Number(s.rev || 0) * Number(s.margin || 0) / 100;
      return (F / k) / Math.pow(1 + k, years) + add;
    }
    if (s.type === "gv") {
      var g = Math.min(Number(s.g || 0) / 100, k - 0.005);
      return (Number(s.d || 0) / (k - g)) / Math.pow(1 + k, years) + add;
    }
    return 0;
  }

  function scenarioMath(s, Kpct) {
    var k = Kpct / 100;
    var years = Math.max(0, (Number(s.year) || BASE_YEAR) - BASE_YEAR);
    var disc = Math.pow(1 + k, years);
    var add = Number(s.addBack || 0);
    var addStr = add ? " " + (add >= 0 ? "+" : "−") + " " + fmtB(Math.abs(add)) + " interim/cash" : "";
    if (s.type === "nav") {
      return "NAV ≈ " + fmtB(Number(s.value || 0)) + " (liquidation / distressed sale)";
    }
    if (s.type === "epv") {
      var F = s.fcf != null ? Number(s.fcf) : Number(s.rev || 0) * Number(s.margin || 0) / 100;
      var base = s.fcf != null ? "FCF " + fmtB(F)
        : fmtB(Number(s.rev || 0)) + " × " + s.margin + "%";
      var epv = F / k;
      return "EPV(" + s.year + ") = " + base + " ÷ " + Kpct + "% = " + fmtB(epv)
        + " → ÷ " + disc.toFixed(2) + " (" + years + "y @ K) = " + fmtB(epv / disc) + addStr;
    }
    var g2 = Math.min(Number(s.g || 0) / 100, k - 0.005);
    var tv = Number(s.d || 0) / (k - g2);
    return "P = D/(K−G) = " + s.d + "/(" + Kpct + "%−" + (g2 * 100).toFixed(1) + "%) = "
      + fmtB(tv) + " in " + s.year + " → ÷ " + disc.toFixed(2) + " = " + fmtB(tv / disc) + addStr;
  }

  function computeAll() {
    var vals = state.data.scenarios.map(function (s) { return scenarioValue(s, state.K); });
    var tot = state.weights.reduce(function (a, b) { return a + b; }, 0) || 1;
    var probs = state.weights.map(function (w) { return w / tot; });
    var contribs = probs.map(function (p, i) { return p * vals[i]; });
    var EV = contribs.reduce(function (a, b) { return a + b; }, 0);
    return { vals: vals, probs: probs, contribs: contribs, EV: EV };
  }

  /* ---------- unit coercion (mirror of the server's) ---------- */
  function normalizeUnits(d) {
    var notes = [];
    var asPct = function (n) { return Math.round(n * 100 * 1000) / 1000; };
    if (d && typeof d.K === "number" && d.K > 0 && d.K < 1) {
      notes.push("K = " + d.K + " read as " + asPct(d.K) + "%");
      d.K = asPct(d.K);
    }
    if (d && Array.isArray(d.scenarios)) {
      var sum = 0, allNum = true;
      d.scenarios.forEach(function (x) {
        if (!x) { allNum = false; return; }
        if (typeof x.g === "number" && x.g !== 0 && Math.abs(x.g) < 1) {
          notes.push((x.name || "scenario") + ": G = " + x.g + " read as " + asPct(x.g) + "%");
          x.g = asPct(x.g);
        }
        if (typeof x.margin === "number" && x.margin !== 0 && Math.abs(x.margin) < 1) {
          notes.push((x.name || "scenario") + ": margin = " + x.margin + " read as " + asPct(x.margin) + "%");
          x.margin = asPct(x.margin);
        }
        var p = Number(x.prob);
        if (isFinite(p)) sum += p; else allNum = false;
      });
      if (allNum && sum > 0.98 && sum < 1.02) {
        d.scenarios.forEach(function (x) { if (x) x.prob = asPct(Number(x.prob)); });
        notes.push("probabilities summed to 1; read as percentages");
      }
    }
    return notes;
  }

  /* ---------- persistence ----------
     Persisted state is untrusted input and gets validated exactly as the
     server validates a worksheet. K is percentage points: a stored 0.085
     meaning 8.5% would be read as 0.085%, divided into 0.00085, and return a
     valuation in the tens of trillions — a number wrong by three orders of
     magnitude that still renders as a confident answer.

     It is also scoped to one worksheet. Without that, the probabilities and
     cost of capital you set while looking at one company silently become the
     starting assumptions for the next one. */
  var STATE_VERSION = 1;

  function worksheetKey(d) {
    return [d.company, d.asOf, d.mark && d.mark.value].join("|");
  }

  function validK(v) {
    var n = Number(v);
    return isFinite(n) && n >= 1 && n <= 30 ? n : null;
  }

  function validWeights(w, count) {
    if (!Array.isArray(w) || w.length !== count) return null;
    var out = [];
    for (var i = 0; i < w.length; i++) {
      var n = Number(w[i]);
      if (!isFinite(n) || n < 0 || n > 100) return null;
      out.push(n);
    }
    return out;
  }

  function persist() {
    try {
      if (window.openai && typeof window.openai.setWidgetState === "function") {
        window.openai.setWidgetState({
          version: STATE_VERSION,
          worksheetKey: worksheetKey(state.data),
          K: state.K,
          weights: state.weights,
        });
      }
    } catch (e) { /* widget state is a nicety, never fatal */ }
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    var t = (window.openai && window.openai.theme) || null;
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  }

  /* ---------- render ---------- */
  function render() {
    var d = state.data;
    var html = "";

    html += '<div class="wrap">';

    // Say so when the model's own cost of capital could not be used. Silently
    // substituting a default is how a valuation ends up resting on a number
    // nobody chose and nobody can see.
    if (state.unitNotes && state.unitNotes.length) {
      html += '<div class="note">Unit note: ' + esc(state.unitNotes.join("; "))
        + ". Rates are percentage points — 8.5 means 8.5%.</div>";
    }

    if (validK(d.K) === null) {
      html += '<div class="warn">The model supplied K = ' + esc(d.K)
        + '%, which is outside the 1-30% range this worksheet accepts'
        + ' (rates are percentage points: 8.5 means 8.5%). Showing K = '
        + esc(state.K) + '% instead — set it with the slider below.</div>';
    }

    html += '<div class="eyebrow">NAV / EPV / GV · EXPECTED-VALUE METHOD</div>'
      + '<h1 class="title">' + esc(d.company) + " — what is it actually worth?</h1>"
      // K is bound to the live value, never to the input. A header that
      // reports the model's K while the engine runs a different one is how a
      // three-orders-of-magnitude error reads as a considered answer.
      + '<div class="meta">' + esc(d.status) + " · as of " + esc(d.asOf)
      + ' · K = <span id="hdr-k"></span></div>';

    html += '<div class="hero">'
      + '<div class="ev-label">EXPECTED VALUE</div>'
      + '<div class="hero-row">'
      + '<span class="ev-num" id="ev-num"></span>'
      + '<span class="ev-vs"><b id="ev-pct"></b> of the ' + fmtB(d.mark.value)
      + " mark (" + esc(d.mark.label) + ") — <b id=\"ev-delta\"></b> <span id=\"ev-word\"></span></span>"
      + "</div>"
      + '<div class="tape-track"><div class="tape-fill" id="tape-fill"></div>'
      + '<div class="tape-mark" id="tape-mark"></div></div>'
      + '<div class="tape-legend"><div class="tape-keys" id="tape-keys"></div>'
      + '<span class="tape-marklabel">▲ mark ' + fmtB(d.mark.value) + "</span></div></div>";

    html += '<div class="controls"><div class="presets" id="presets"></div>'
      + '<div class="k-wrap"><div class="slider-row">'
      + '<div class="lab"><span>K — cost of capital</span><span class="val" id="k-val"></span></div>'
      + '<input type="range" id="k-slider" min="5" max="20" step="0.5" aria-label="Cost of capital">'
      + "</div></div></div>";

    html += '<div id="scen-cards"></div>';

    html += '<div class="sect"><div class="sect-label">THE LEDGER</div>'
      + '<div class="ledger-eq" id="ledger-eq"></div>'
      + '<div class="ledger-sum" id="ledger-sum"></div>'
      + '<p class="ledger-note">' + esc(d.impliedProbs) + "</p></div>";

    html += financialsHTML();

    html += '<button class="btn" id="report-toggle" style="margin-top:12px">Show the full worksheet</button>';
    html += '<div id="report-host" hidden></div>';

    html += '<div class="foot">Model-generated estimates from public reporting. '
      + "Verify against primary sources. Not investment advice.</div>";

    html += "</div>";
    root.innerHTML = html;

    /* presets */
    var presetHost = document.getElementById("presets");
    var presets = { base: (d.presets && d.presets.base) || state.weights.slice() };
    if (d.presets) {
      if (d.presets.marketImplied) presets.marketImplied = d.presets.marketImplied;
      if (d.presets.bear) presets.bear = d.presets.bear;
    }
    [["Base case", "base"], ["Market-implied", "marketImplied"], ["Bear", "bear"]]
      .forEach(function (pair) {
        if (!presets[pair[1]]) return;
        var b = document.createElement("button");
        b.className = "btn";
        b.type = "button";
        b.textContent = pair[0];
        b.addEventListener("click", function () {
          state.weights = presets[pair[1]].slice();
          syncInputs(); update(); persist();
        });
        presetHost.appendChild(b);
      });

    /* K slider */
    var kEl = document.getElementById("k-slider");
    kEl.value = state.K;
    kEl.addEventListener("input", function (e) {
      state.K = Number(e.target.value); update(); persist();
    });

    /* scenario cards */
    var cards = document.getElementById("scen-cards");
    d.scenarios.forEach(function (s, i) {
      var card = document.createElement("div");
      card.className = "scen";
      card.style.borderLeftColor = scenColor(i);
      card.innerHTML =
        '<div class="scen-top">'
        + '<span class="scen-name">' + (i + 1) + ". " + esc(s.name) + "</span>"
        + '<span class="scen-value" id="calc-' + i + '"></span></div>'
        + '<div class="scen-rule">' + esc(s.rule) + "</div>"
        + '<p class="scen-desc">' + esc(s.desc) + "</p>"
        // The weight and what it is worth, side by side: dragging the slider
        // moves a dollar contribution, not an abstract percentage.
        + '<div class="slider-row"><div class="lab"><span>Probability × value today</span>'
        + '<span class="val" id="pw-' + i + '"></span></div>'
        + '<input type="range" id="w-' + i + '" min="0" max="100" step="1" '
        + 'aria-label="Probability weight for ' + esc(s.name) + '" '
        + 'style="accent-color:' + scenColor(i) + '"></div>'
        + '<button class="link" id="mt-' + i + '" type="button">Show the math</button>'
        + '<div id="mb-' + i + '" hidden><div class="math-box" id="mx-' + i + '"></div>'
        + '<div class="assump-row" id="ar-' + i + '"></div></div>';
      cards.appendChild(card);

      document.getElementById("w-" + i).addEventListener("input", function (e) {
        state.weights[i] = Number(e.target.value); update(); persist();
      });
      document.getElementById("mt-" + i).addEventListener("click", function () {
        var box = document.getElementById("mb-" + i);
        box.hidden = !box.hidden;
        document.getElementById("mt-" + i).textContent =
          box.hidden ? "Show the math" : "Hide the math";
      });

      var fields;
      if (s.type === "nav") {
        fields = [["value", "NAV ($B)"]];
      } else if (s.type === "epv") {
        fields = s.fcf != null
          ? [["fcf", "Steady FCF ($B)"], ["year", "Year"], ["addBack", "Interim/cash ($B)"]]
          : [["rev", "Revenue ($B)"], ["margin", "FCF margin (%)"], ["year", "Year"], ["addBack", "Interim/cash ($B)"]];
      } else {
        fields = [["d", "FCF D ($B)"], ["g", "Growth G (%)"], ["year", "Year"], ["addBack", "Interim/cash ($B)"]];
      }
      var ar = document.getElementById("ar-" + i);
      fields.forEach(function (f) {
        var lab = document.createElement("label");
        lab.className = "assump";
        var span = document.createElement("span");
        span.textContent = f[1];
        var inp = document.createElement("input");
        inp.type = "number";
        inp.step = "any";
        inp.value = s[f[0]] == null ? 0 : s[f[0]];
        inp.addEventListener("input", function (e) {
          s[f[0]] = Number(e.target.value) || 0; update();
        });
        lab.appendChild(span); lab.appendChild(inp); ar.appendChild(lab);
      });
    });

    /* report toggle */
    document.getElementById("report-toggle").addEventListener("click", function () {
      var host = document.getElementById("report-host");
      var btn = document.getElementById("report-toggle");
      if (host.hidden) {
        host.innerHTML = reportHTML();
        host.hidden = false;
        btn.textContent = "Hide the full worksheet";
        try {
          if (window.openai && typeof window.openai.requestDisplayMode === "function") {
            window.openai.requestDisplayMode({ mode: "fullscreen" });
          }
        } catch (e) { /* inline is a fine fallback */ }
      } else {
        host.hidden = true;
        host.innerHTML = "";
        btn.textContent = "Show the full worksheet";
      }
    });

    syncInputs();
    update();
  }

  function syncInputs() {
    state.data.scenarios.forEach(function (_, i) {
      var el = document.getElementById("w-" + i);
      if (el) el.value = state.weights[i];
    });
    var k = document.getElementById("k-slider");
    if (k) k.value = state.K;
  }

  function update() {
    var d = state.data;
    var r = computeAll();
    var scale = Math.max(d.mark.value, r.EV) * 1.12 || 1;

    document.getElementById("ev-num").textContent = fmtB(r.EV);
    var pctEl = document.getElementById("ev-pct");
    pctEl.textContent = Math.round((r.EV / d.mark.value) * 100) + "%";
    var verdictColor = r.EV >= d.mark.value ? "var(--good)" : "var(--market)";
    pctEl.style.color = verdictColor;
    var deltaEl = document.getElementById("ev-delta");
    var wordEl = document.getElementById("ev-word");
    if (deltaEl) {
      deltaEl.textContent = fmtB(Math.abs(d.mark.value - r.EV));
      deltaEl.style.color = verdictColor;
    }
    if (wordEl) {
      wordEl.textContent = r.EV >= d.mark.value ? "above it" : "below it";
    }
    document.getElementById("k-val").textContent = (Math.round(state.K * 10) / 10) + "%";
    var hdrK = document.getElementById("hdr-k");
    if (hdrK) hdrK.textContent = (Math.round(state.K * 10) / 10) + "%";

    document.getElementById("tape-fill").innerHTML = r.contribs.map(function (c, i) {
      return '<div class="tape-seg" style="width:' + Math.max(0, (c / scale) * 100)
        + "%;background:" + scenColor(i) + '" title="' + esc(d.scenarios[i].name) + ": "
        + fmtB(c) + '"></div>';
    }).join("");
    document.getElementById("tape-mark").style.left = ((d.mark.value / scale) * 100) + "%";
    document.getElementById("tape-keys").innerHTML = d.scenarios.map(function (s, i) {
      return '<span class="tape-key"><span class="tape-swatch" style="background:'
        + scenColor(i) + '"></span>' + esc(s.name) + " <b>" + fmtB(r.contribs[i]) + "</b></span>";
    }).join("");

    d.scenarios.forEach(function (s, i) {
      // Top right: what this world is worth today. Slider label: the weight
      // and the dollars that weight puts into the expected value.
      document.getElementById("calc-" + i).innerHTML =
        fmtB(r.vals[i]) + " <small>today</small>";
      document.getElementById("pw-" + i).textContent =
        (r.probs[i] * 100).toFixed(0) + "% × " + fmtB(r.vals[i])
        + " = " + fmtB(r.contribs[i]);
      var mx = document.getElementById("mx-" + i);
      if (mx) mx.textContent = scenarioMath(s, state.K);
    });

    document.getElementById("ledger-eq").textContent = "E(V) = " + r.probs.map(function (p, i) {
      return (p * 100).toFixed(0) + "%·" + fmtB(r.vals[i]);
    }).join(" + ");
    document.getElementById("ledger-sum").textContent =
      "E(V) ≈ " + fmtB(r.EV) + "  vs.  mark " + fmtB(d.mark.value) + "  →  "
      + (r.EV >= d.mark.value ? "premium" : "discount") + " of "
      + fmtB(Math.abs(d.mark.value - r.EV));

    var host = document.getElementById("report-host");
    if (host && !host.hidden) host.innerHTML = reportHTML();
  }

  /* ---------- the three statements ---------- */
  function financialsHTML() {
    var f = state.data.financials;
    if (!f || !Array.isArray(f.periods) || !f.periods.length) return "";

    // Accounting convention: parenthesised negatives, right-aligned, aligned
    // decimals. Anyone who reads statements reads them this way.
    var num = function (v) {
      if (v == null || !isFinite(Number(v))) return "—";
      var n = Number(v);
      // One decimal throughout, so a balance-sheet total does not read as
      // less precise than the cash line above it.
      var body = Math.abs(n) >= 1000
        ? Math.round(Math.abs(n)).toLocaleString()
        : Math.abs(n).toFixed(1);
      return n < 0 ? '<span class="neg">(' + body + ")</span>" : body;
    };

    var table = function (title, rows) {
      if (!Array.isArray(rows) || !rows.length) return "";
      var h = '<div class="fin-stmt"><h4>' + esc(title)
        + '</h4><div class="fin-scroll"><table><tr><th></th>';
      f.periods.forEach(function (p) { h += "<th>" + esc(p) + "</th>"; });
      h += "</tr>";
      rows.forEach(function (r, i) {
        h += "<tr" + (i === rows.length - 1 ? ' class="total"' : "") + "><td>"
          + esc(r.line) + "</td>";
        for (var c = 0; c < f.periods.length; c++) {
          h += "<td>" + num(r.values && r.values[c]) + "</td>";
        }
        h += "</tr>";
      });
      return h + "</table></div></div>";
    };

    return '<div class="sect fin"><div class="sect-label">THE THREE STATEMENTS'
      + '<span class="fin-unit">' + esc(f.unit || "$B") + "</span></div>"
      + table("Income statement", f.income)
      + table("Balance sheet", f.balance)
      + table("Cash flow", f.cashFlow)
      + "</div>";
  }

  function reportHTML() {
    var d = state.data;
    var r = computeAll();
    var h = '<div class="report">';

    h += "<h3>A. Thesis generation</h3><div class=tbl-scroll><table><tr><th>Signal</th><th>Observed</th></tr>";
    d.sectionA.forEach(function (x) {
      h += "<tr><td>" + esc(x.signal) + "</td><td>" + esc(x.observed) + "</td></tr>";
    });
    h += "</table></div>";

    h += "<h3>B. Micro due diligence</h3><div class=tbl-scroll><table><tr><th>Line</th><th>Figure</th><th>Notes</th></tr>";
    d.sectionB.rows.forEach(function (x) {
      h += "<tr><td>" + esc(x.line) + '</td><td class="n">' + esc(x.figure) + "</td><td>"
        + esc(x.notes) + "</td></tr>";
    });
    h += "</table></div>";
    h += "<h4>Key risks to cash generation</h4><p>" + esc(d.sectionB.risks) + "</p>";
    h += "<h4>Management / governance</h4><p>" + esc(d.sectionB.governance) + "</p>";

    h += "<h3>C. Macro due diligence</h3><div class=tbl-scroll><table><tr><th>Factor</th><th>Assessment</th></tr>";
    d.sectionC.forEach(function (x) {
      h += "<tr><td>" + esc(x.factor) + "</td><td>" + esc(x.assessment) + "</td></tr>";
    });
    h += "</table></div>";

    h += "<h3>D. The math (K = " + esc(state.K) + "%)</h3>";
    d.scenarios.forEach(function (s, i) {
      h += "<h4>D" + (i + 1) + ". " + esc(s.name)
        + ' <span style="font-weight:400;color:var(--sub)">(' + esc(s.rule) + ")</span></h4>"
        + "<p>" + esc(s.desc) + "</p>"
        + '<div class="mathline">' + esc(scenarioMath(s, state.K)) + "</div>"
        + '<div class="mathfinal">Value today ≈ ' + fmtB(r.vals[i]) + "</div>";
    });

    h += "<h4>Incremental ROIC vs. K</h4>";
    d.roicTest.lines.forEach(function (l) {
      h += '<div class="mathline">' + esc(l) + "</div>";
    });
    h += '<div class="mathfinal">' + esc(d.roicTest.verdict) + "</div>";

    h += "<h3>E. Expected value</h3><div class=tbl-scroll><table>"
      + "<tr><th>#</th><th>Scenario</th><th>Value today</th><th>Prob.</th><th>Contribution</th></tr>";
    d.scenarios.forEach(function (s, i) {
      h += "<tr><td>" + (i + 1) + "</td><td>" + esc(s.name) + '</td><td class="n">'
        + fmtB(r.vals[i]) + '</td><td class="n">' + (r.probs[i] * 100).toFixed(0)
        + '%</td><td class="n">' + fmtB(r.contribs[i]) + "</td></tr>";
    });
    h += '<tr class="evrow"><td></td><td>EXPECTED VALUE</td><td></td><td class="n">100%</td>'
      + '<td class="n">≈ ' + fmtB(r.EV) + "</td></tr></table></div>";

    h += "<h3>F. The trade</h3><div class=tbl-scroll><table>"
      + "<tr><td>Market mark (" + esc(d.mark.label) + ')</td><td class="n">' + fmtB(d.mark.value)
      + " (" + esc(d.mark.multiple) + ")</td></tr>"
      + '<tr><td>Expected value, this worksheet</td><td class="n">≈ ' + fmtB(r.EV) + "</td></tr>"
      + '<tr><td>E(V) as % of mark</td><td class="n">≈ '
      + Math.round(r.EV / d.mark.value * 100) + "%</td></tr></table></div>";

    h += "<h4>Implied probabilities</h4><p>" + esc(d.impliedProbs) + "</p>";
    h += "<h4>Setting up the trade</h4><p>" + esc(d.tradeSetup) + "</p>";
    h += '<p class="fine">Sources: ' + esc(d.sources) + "</p>";
    h += "</div>";
    return h;
  }

  /* ---------- boot ---------- */
  function readData() {
    var o = window.openai || {};
    // toolOutput carries the server's structuredContent — the worksheet after
    // validation and unit coercion. toolInput is the model's raw arguments,
    // which never passed through the server: on a rejected call it is the
    // only thing available, and it is exactly the payload that put K = 0.085
    // on screen. Prefer the validated copy whenever the host provides it.
    var candidates = [o.toolOutput, o.toolInput];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c) continue;
      if (c.scenarios && c.scenarios.length) return c;
      if (c.worksheet && c.worksheet.scenarios) return c.worksheet;
    }
    return null;
  }

  function boot(data) {
    var unitNotes = normalizeUnits(data);
    var restored = (window.openai && window.openai.widgetState) || null;
    // Reuse persisted knobs only when they belong to this worksheet and this
    // state shape. Anything else starts from the model's own numbers.
    var reusable = !!restored
      && restored.version === STATE_VERSION
      && restored.worksheetKey === worksheetKey(data);

    state = {
      data: data,
      unitNotes: unitNotes,
      K: (reusable && validK(restored.K)) || validK(data.K) || 11,
      weights: (reusable && validWeights(restored.weights, data.scenarios.length))
        || data.scenarios.map(function (s) { return Number(s.prob) || 20; }),
    };
    applyTheme();
    render();
  }

  root.innerHTML = '<div class="waiting">Building the worksheet…</div>';
  applyTheme();

  var data = readData();
  if (data) {
    boot(data);
  } else {
    // The host may set globals a beat after the frame loads.
    var tries = 0;
    var timer = setInterval(function () {
      var d = readData();
      if (d) { clearInterval(timer); boot(d); return; }
      if (++tries > 100) {
        clearInterval(timer);
        root.innerHTML = '<div class="waiting">No worksheet data arrived. '
          + "Ask again and the model will rebuild it.</div>";
      }
    }, 100);
  }

  window.addEventListener("openai:set_globals", function () {
    applyTheme();
    if (!state) {
      var d = readData();
      if (d) boot(d);
    }
  });
}

// The host renders this as an ES module, per the Apps SDK resource shape.
// Everything is inline: no external bundle, no dependencies, nothing for a
// content security policy to block.
//
// The try/catch and error listeners exist because a widget that throws
// otherwise shows only a bare "Runtime error" in ChatGPT, with the real
// exception buried in a sandboxed iframe console. Failing loudly on screen
// costs nothing and turns a blind failure into a legible one.
export const WIDGET_HTML =
  "<style>" + WIDGET_CSS + "</style>" +
  '<div id="mos-root"></div>' +
  '<script type="module">\n' +
  // Bundlers rewrite the function before it is serialised. esbuild with
  // `keepNames` (wrangler's default) turns every inner function into
  // `__name(fn, "fn")` and defines `__name` at module scope — which
  // toString() does not carry across, so the widget dies on load with
  // `ReferenceError: __name is not defined`. Shipping the helpers inside the
  // emitted script makes the widget independent of how it was built. Add a
  // shim here if a new helper ever shows up in check.mjs.
  "const __defProp = Object.defineProperty;\n" +
  "const __name = function (target, value) {\n" +
  "  try { __defProp(target, 'name', { value: value, configurable: true }); } catch (e) {}\n" +
  "  return target;\n" +
  "};\n" +
  "const __show = function (label, detail) {\n" +
  "  const el = document.getElementById('mos-root');\n" +
  "  if (!el) return;\n" +
  "  el.innerHTML = '<div class=\"waiting\"><b>' + label + '</b><br><br>' +\n" +
  "    String(detail).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>';\n" +
  "};\n" +
  "window.addEventListener('error', function (e) {\n" +
  "  __show('The worksheet hit an error.', (e && e.message) || e);\n" +
  "});\n" +
  "window.addEventListener('unhandledrejection', function (e) {\n" +
  "  __show('The worksheet hit an error.', (e && e.reason && e.reason.message) || e.reason);\n" +
  "});\n" +
  "try {\n" +
  "  (" + widgetMain.toString() + ")();\n" +
  "} catch (e) {\n" +
  "  __show('The worksheet could not start.', (e && e.stack) || e);\n" +
  "}\n" +
  "<\/script>";

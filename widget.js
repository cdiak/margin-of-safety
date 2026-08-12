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
  --bg:#E9ECEE; --panel:#FFFFFF; --ink:#16232E; --sub:#5C6B76;
  --rule:#C7CFD4; --track:#F2F4F5; --hilite:#F2D45C; --hilite-soft:#F4F1DF;
  --market:#A33B2E; --good:#1C7A6B;
  --s1:#8A93A0; --s2:#5E7A8C; --s3:#2E5E63; --s4:#1C7A6B; --s5:#C29130;
}
:root[data-theme="dark"]{
  --bg:#23282D; --panel:#272C31; --ink:#C8CCD0; --sub:#8B9197;
  --rule:#3B4149; --track:#2C3237; --hilite:#45402A; --hilite-soft:#31302A;
  --market:#E08070; --good:#7FBF8E;
  --s1:#5A6167; --s2:#767D84; --s3:#9199A0; --s4:#ADB4BB; --s5:#D0D6DC;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg); color:var(--ink);
  font-family:'Iowan Old Style','Palatino Linotype',Palatino,Charter,Georgia,serif;
  font-size:15px; line-height:1.5;
}
.wrap{padding:14px}
.mono{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace}
.num{font-variant-numeric:tabular-nums}

.head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.eyebrow{font-size:11px;letter-spacing:.1em;color:var(--sub)}
.title{font-size:19px;font-weight:700;margin:0;text-wrap:balance}
.status-line{font-size:12px;color:var(--sub)}

.tape-card{border:1px solid var(--ink);padding:12px;margin-bottom:14px;background:var(--panel)}
.tape-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.tape-label{font-size:11px;letter-spacing:.08em;color:var(--sub)}
.tape-ev{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:22px;font-weight:700;margin-left:8px;font-variant-numeric:tabular-nums}
.tape-pct{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-weight:700}
.tape-track{position:relative;height:32px;overflow:hidden;background:var(--track);border:1px solid var(--rule)}
.tape-fill{position:absolute;inset:0;display:flex}
.tape-seg{height:100%;transition:width .3s}
.tape-mark{position:absolute;top:0;bottom:0;width:2px;background:var(--market)}
.tape-legend{display:flex;justify-content:space-between;gap:8px;margin-top:5px;flex-wrap:wrap}
.tape-keys{display:flex;flex-wrap:wrap;gap:3px 10px}
.tape-key{font-size:10.5px;color:var(--sub);display:flex;align-items:center;gap:4px}
.tape-swatch{width:8px;height:8px;display:inline-block;flex:none}
.tape-marklabel{font-size:10.5px;font-weight:700;color:var(--market)}

.controls{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.presets{display:flex;gap:6px;flex-wrap:wrap}
.btn{padding:5px 10px;font-size:12px;border:1px solid var(--ink);background:var(--panel);
  color:var(--ink);cursor:pointer;font-family:inherit}
.btn:hover{background:var(--hilite-soft)}
.btn:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.k-wrap{flex:1;min-width:170px;max-width:280px}

.scen{border:1px solid var(--rule);border-left-width:4px;border-left-style:solid;
  margin-bottom:10px;padding:11px;background:var(--panel)}
.scen-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.scen-name{font-weight:700;font-size:14px}
.scen-rule{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:10.5px;
  background:var(--hilite-soft);padding:2px 5px;margin-left:5px}
.scen-calc{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;font-variant-numeric:tabular-nums}
.scen-desc{font-size:12.5px;color:var(--sub);margin:4px 0 8px}
.slider-row .lab{display:flex;justify-content:space-between;font-size:12px;color:var(--sub)}
.slider-row .val{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-weight:700}
input[type=range]{width:100%;height:4px;cursor:pointer;margin:4px 0 0}
.link{font-size:12px;color:var(--sub);background:none;border:none;font-family:inherit;
  text-decoration:underline;cursor:pointer;padding:0;margin-top:6px}
.math-box{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:11.5px;
  line-height:1.55;background:var(--hilite-soft);padding:7px 9px;margin-top:7px;overflow-x:auto}
.assump-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:9px;padding-top:9px;
  border-top:1px dashed var(--rule)}
.assump{display:flex;flex-direction:column;gap:2px;font-size:11.5px;color:var(--sub)}
.assump input{width:88px;padding:4px 6px;font-family:ui-monospace,Menlo,monospace;font-size:12px;
  border:1px solid var(--rule);background:var(--panel);color:var(--ink)}

.ledger{border:1px solid var(--rule);padding:12px;margin-top:12px;background:var(--panel)}
.ledger-title{font-size:11px;letter-spacing:.08em;color:var(--sub);margin-bottom:7px}
.ledger-eq{font-family:ui-monospace,Menlo,monospace;font-size:12px;margin-bottom:6px;
  word-wrap:break-word;font-variant-numeric:tabular-nums}
.ledger-sum{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--hilite);
  color:#16232E;display:inline-block;padding:3px 7px;font-variant-numeric:tabular-nums}
.ledger-note{font-size:12.5px;color:var(--sub);margin:9px 0 0}

.report{margin-top:14px;border-top:2px solid var(--ink);padding-top:14px}
.report h3{font-size:15px;margin:16px 0 5px}
.report h4{font-size:13px;margin:11px 0 3px}
.report p{font-size:13px;margin:5px 0}
.report table{width:100%;border-collapse:collapse;font-size:12px;margin:7px 0}
.report th{text-align:left;border-bottom:2px solid var(--ink);padding:4px 5px;font-size:11px}
.report td{border-bottom:1px solid var(--rule);padding:5px;vertical-align:top}
.report td.n{text-align:right;font-family:ui-monospace,Menlo,monospace;white-space:nowrap;
  font-variant-numeric:tabular-nums}
.report .mathline{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;margin:2px 0 2px 10px;
  white-space:pre-wrap}
.report .mathfinal{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:11.5px;
  background:var(--hilite);color:#16232E;padding:2px 7px;display:inline-block;margin:3px 0 7px 10px}
.report .evrow td{background:var(--hilite);color:#16232E;font-weight:700}
.tbl-scroll{overflow-x:auto}
.fine{font-size:11.5px;color:var(--sub)}
.foot{margin-top:14px;padding-top:10px;border-top:1px solid var(--rule);font-size:11.5px;color:var(--sub)}
.waiting{padding:24px 14px;color:var(--sub);font-size:13px}
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

  /* ---------- persistence ---------- */
  function persist() {
    try {
      if (window.openai && typeof window.openai.setWidgetState === "function") {
        window.openai.setWidgetState({ K: state.K, weights: state.weights });
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

    html += '<div class="head"><div>'
      + '<div class="eyebrow">NAV / EPV / GV · EXPECTED-VALUE METHOD</div>'
      + '<h1 class="title">' + esc(d.company) + " — what is it actually worth?</h1>"
      + '<div class="status-line">' + esc(d.status) + " · as of " + esc(d.asOf)
      + " · K = " + esc(d.K) + "%</div>"
      + "</div></div>";

    html += '<div class="tape-card">'
      + '<div class="tape-head">'
      + '<div><span class="tape-label">EXPECTED VALUE</span><span class="tape-ev" id="ev-num"></span></div>'
      + '<div style="font-size:11px;color:var(--sub)"><span class="tape-pct" id="ev-pct"></span> of the mark</div>'
      + "</div>"
      + '<div class="tape-track"><div class="tape-fill" id="tape-fill"></div>'
      + '<div class="tape-mark" id="tape-mark"></div></div>'
      + '<div class="tape-legend"><div class="tape-keys" id="tape-keys"></div>'
      + '<span class="tape-marklabel">▲ mark ' + fmtB(d.mark.value) + " — " + esc(d.mark.label)
      + "</span></div></div>";

    html += '<div class="controls"><div class="presets" id="presets"></div>'
      + '<div class="k-wrap"><div class="slider-row">'
      + '<div class="lab"><span>K — cost of capital</span><span class="val" id="k-val"></span></div>'
      + '<input type="range" id="k-slider" min="7" max="18" step="0.5" aria-label="Cost of capital">'
      + "</div></div></div>";

    html += '<div id="scen-cards"></div>';

    html += '<div class="ledger"><div class="ledger-title">THE LEDGER</div>'
      + '<div class="ledger-eq" id="ledger-eq"></div>'
      + '<div class="ledger-sum" id="ledger-sum"></div>'
      + '<p class="ledger-note">' + esc(d.impliedProbs) + "</p></div>";

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
        '<div class="scen-head"><div>'
        + '<span class="scen-name">' + (i + 1) + ". " + esc(s.name) + "</span>"
        + '<span class="scen-rule">' + esc(s.rule) + "</span></div>"
        + '<div class="scen-calc" id="calc-' + i + '"></div></div>'
        + '<p class="scen-desc">' + esc(s.desc) + "</p>"
        + '<div class="slider-row"><div class="lab"><span>Probability weight</span>'
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
    pctEl.style.color = r.EV >= d.mark.value ? "var(--good)" : "var(--market)";
    document.getElementById("k-val").textContent = state.K + "%";

    document.getElementById("tape-fill").innerHTML = r.contribs.map(function (c, i) {
      return '<div class="tape-seg" style="width:' + Math.max(0, (c / scale) * 100)
        + "%;background:" + scenColor(i) + '" title="' + esc(d.scenarios[i].name) + ": "
        + fmtB(c) + '"></div>';
    }).join("");
    document.getElementById("tape-mark").style.left = ((d.mark.value / scale) * 100) + "%";
    document.getElementById("tape-keys").innerHTML = d.scenarios.map(function (s, i) {
      return '<span class="tape-key"><span class="tape-swatch" style="background:'
        + scenColor(i) + '"></span>' + esc(s.name) + " " + fmtB(r.contribs[i]) + "</span>";
    }).join("");

    d.scenarios.forEach(function (s, i) {
      document.getElementById("calc-" + i).innerHTML =
        fmtB(r.vals[i]) + " × " + (r.probs[i] * 100).toFixed(0) + "% = <b>"
        + fmtB(r.contribs[i]) + "</b>";
      document.getElementById("pw-" + i).textContent =
        state.weights[i] + " → " + (r.probs[i] * 100).toFixed(0) + "%";
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
    var candidates = [o.toolInput, o.toolOutput];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c) continue;
      if (c.scenarios && c.scenarios.length) return c;
      if (c.worksheet && c.worksheet.scenarios) return c.worksheet;
    }
    return null;
  }

  function boot(data) {
    var restored = (window.openai && window.openai.widgetState) || null;
    state = {
      data: data,
      K: (restored && Number(restored.K)) || Number(data.K) || 11,
      weights: (restored && restored.weights && restored.weights.length === data.scenarios.length)
        ? restored.weights.slice()
        : data.scenarios.map(function (s) { return Number(s.prob) || 20; }),
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

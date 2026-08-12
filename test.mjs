/* ============================================================
   Regression tests.

   Two unit errors have shipped from this codebase, both of the same
   shape: a rate expressed as a fraction where the code expects
   percentage points. K = 0.085 meaning 8.5% divides into 0.00085 and
   values Microsoft at $42T. Neither error throws; both render as a
   confident answer. So the tests below assert on numbers, not on
   whether the code runs.

   The widget is booted for real — serialised source, a minimal DOM,
   a stubbed host — because the bug lived in state hydration, which no
   amount of checking the source text would have caught.

   Usage:  node test.mjs
   ============================================================ */

import { WIDGET_HTML } from "./widget.js";
import { handleRequest } from "./server.js";

/* ---------- a DOM small enough to boot the widget in ---------- */

function fakeDom() {
  const make = (tag) => {
    const el = {
      tagName: tag, children: [], style: {}, dataset: {},
      className: "", _text: "", _html: "", hidden: false, value: "",
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      replaceWith() {},
      addEventListener(type, fn) { (this._on ||= {})[type] = fn; },
      removeEventListener() {},
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k]; },
      scrollIntoView() {},
      get textContent() { return this._text; },
      set textContent(v) { this._text = String(v); },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); },
    };
    return el;
  };

  const byId = new Map();
  const doc = {
    documentElement: make("html"),
    createElement: make,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, make("div"));
      return byId.get(id);
    },
    addEventListener() {},
  };
  return { doc, byId };
}

function bootWidget(worksheet, widgetState) {
  const { doc, byId } = fakeDom();
  const open = WIDGET_HTML.indexOf('<script type="module">');
  const src = WIDGET_HTML.slice(
    open + '<script type="module">'.length,
    WIDGET_HTML.indexOf("</script>", open)
  );

  const win = {
    __exposeForTests: true,
    openai: {
      toolInput: worksheet,
      widgetState,
      theme: "dark",
      setWidgetState(s) { win.__saved = s; },
    },
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
    setInterval: () => 0,
    clearInterval: () => {},
  };

  // The widget reads free `document` / `window`; hand it both.
  new Function("window", "document", "setInterval", "clearInterval", src)(
    win, doc, win.setInterval, win.clearInterval
  );

  const text = (id) => byId.get(id)?.textContent ?? "";
  return { ev: text("ev-num"), k: text("k-val"), hdrK: text("hdr-k"), saved: win.__saved,
    rootHtml: byId.get("mos-root")?.innerHTML ?? "", buildWorkbook: win.__mosBuildWorkbook };
}

/* ---------- fixture ---------- */

const sc = (o) => Object.assign({ name: "s", rule: "r", desc: "d" }, o);
const WORKSHEET = {
  company: "Testco", status: "public", asOf: "August 12, 2026", headline: "h",
  mark: { value: 3680, label: "market cap", multiple: "30x" },
  K: 8.5, kRationale: "mature, self-funding",
  sectionA: [], sectionB: { rows: [], risks: "", governance: "" }, sectionC: [],
  roicTest: { lines: [], verdict: "Case 3." },
  scenarios: [
    sc({ type: "nav", prob: 5, value: 250 }),
    sc({ type: "epv", prob: 20, fcf: 70, year: 2027, addBack: 0 }),
    sc({ type: "epv", prob: 40, fcf: 95, year: 2028, addBack: 0 }),
    sc({ type: "gv", prob: 25, d: 120, g: 4, year: 2029, addBack: 0 }),
    sc({ type: "gv", prob: 10, d: 180, g: 5, year: 2031, addBack: 0 }),
  ],
  presets: { base: [5, 20, 40, 25, 10], bear: [20, 40, 30, 10, 0], marketImplied: [0, 5, 25, 45, 25] },
  impliedProbs: "ip", tradeSetup: "ts", sources: "s",
};

const key = (d) => [d.company, d.asOf, d.mark.value].join("|");

/* ---------- tests ---------- */

let failures = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log((ok ? "  pass  " : "  FAIL  ") + name +
    (ok ? "" : "\n          expected " + expected + ", got " + actual));
};

console.log("state hydration");

const clean = bootWidget(WORKSHEET, null);
check("uses the model's K when nothing is persisted", clean.k, "8.5%");

// The shipped bug: a fraction persisted from an older call overrode a valid
// input and produced a valuation an order of magnitude too large.
const poisoned = bootWidget(WORKSHEET, {
  version: 1, worksheetKey: key(WORKSHEET), K: 0.085, weights: [5, 20, 40, 25, 10],
});
check("rejects a persisted K of 0.085", poisoned.k, "8.5%");
check("  and does not value it in the trillions", poisoned.ev, clean.ev);

for (const bad of [0.11, 0, -5, 300, NaN, null, "eleven"]) {
  const r = bootWidget(WORKSHEET, { version: 1, worksheetKey: key(WORKSHEET), K: bad });
  check("rejects a persisted K of " + JSON.stringify(bad), r.k, "8.5%");
}

const valid = bootWidget(WORKSHEET, { version: 1, worksheetKey: key(WORKSHEET), K: 12 });
check("keeps a persisted K of 12 for the same worksheet", valid.k, "12%");

console.log("\nstate scoping");

const otherCompany = bootWidget(WORKSHEET, {
  version: 1, worksheetKey: "Othercorp|July 1, 2026|900", K: 14, weights: [50, 50, 0, 0, 0],
});
check("ignores state saved against another worksheet", otherCompany.k, "8.5%");

const oldVersion = bootWidget(WORKSHEET, {
  version: 0, worksheetKey: key(WORKSHEET), K: 14,
});
check("ignores state from an older state shape", oldVersion.k, "8.5%");

const badWeights = bootWidget(WORKSHEET, {
  version: 1, worksheetKey: key(WORKSHEET), K: 9, weights: [1, 2],
});
check("ignores weights of the wrong length", badWeights.ev, bootWidget(WORKSHEET, { version: 1, worksheetKey: key(WORKSHEET), K: 9 }).ev);

console.log("\nunit coercion");

// The retry loop that painted two widgets: a fraction-style K was rejected,
// the model retried, and both calls rendered. Fractions are now read as the
// percentage points they meant, so the first call succeeds and there is
// exactly one widget. The widget mirrors the server, because it renders the
// model's raw arguments.
const clone = () => JSON.parse(JSON.stringify(WORKSHEET));

const serverCall = async (args) => {
  const res = await handleRequest(new Request("http://test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "render_margin_of_safety_worksheet", arguments: args } }),
  }));
  return (await res.json()).result;
};


const fracK = clone(); fracK.K = 0.085;
const fk = bootWidget(fracK, null);
check("widget reads a toolInput K of 0.085 as 8.5%", fk.k, "8.5%");
check("  and the valuation matches the clean run", fk.ev, clean.ev);

const fracG = clone(); fracG.scenarios[3].g = 0.04; fracG.scenarios[4].g = 0.05;
check("widget reads g = 0.04 as 4%", bootWidget(fracG, null).ev, clean.ev);

const fracP = clone(); fracP.scenarios.forEach((x) => { x.prob = x.prob / 100; });
check("widget reads probabilities summing to 1 as percentages", bootWidget(fracP, null).ev, clean.ev);

const point5 = clone(); point5.K = 12;
check("widget leaves a legitimate K of 12 alone", bootWidget(point5, null).k, "12%");

const sv = await serverCall(Object.assign(clone(), { K: 0.085 }));
check("server accepts K = 0.085 by coercion", !!sv.isError, false);
check("  notes the coercion in the output", sv.content[0].text.includes("read as 8.5%"), true);
check("  and passes the coerced K to the widget", sv.structuredContent.worksheet.K, 8.5);

const still = await serverCall(Object.assign(clone(), { K: 45 }));
check("server still rejects a K that means nothing (45)", !!still.isError, true);

console.log("\nthe three statements");

// bootWidget's fixture has no financials, so absence is the default path.
{
  const bare = bootWidget(clone(), null);
  check("widget names the missing statements instead of hiding the section",
    /THE THREE STATEMENTS/.test(bare.rootHtml) && /Not supplied on this run/.test(bare.rootHtml), true);

  const withFin = clone();
  withFin.financials = { unit: "$B", periods: ["FY2025", "FY2026"],
    income: [{ line: "Revenue", values: [60, 64] }],
    balance: [{ line: "Total assets", values: [130, 139] }],
    cashFlow: [{ line: "Free cash flow", values: [11, 12] }],
    forecast: { periods: ["FY2027E"], basis: "b",
      income: [{ line: "Revenue", values: [68] }],
      balance: [{ line: "Total equity", values: [32] }],
      cashFlow: [{ line: "Free cash flow", values: [13] }] } };
  const fin = bootWidget(withFin, null);
  check("widget renders supplied statements as tables",
    /Income statement/.test(fin.rootHtml) && /Free cash flow/.test(fin.rootHtml)
      && !/Not supplied on this run/.test(fin.rootHtml), true);

  const svBare = await serverCall(clone());
  check("server flags the omission in the text output",
    /MISSING: the three statements/.test(svBare.content[0].text), true);
  check("  and tells the model not to call again",
    /Do NOT call the tool again/.test(svBare.content[0].text), true);

  const svFin = await serverCall(withFin);
  check("server stays quiet when the statements are supplied",
    /MISSING:/.test(svFin.content[0].text), false);

  const histOnly = clone();
  histOnly.financials = { unit: "$B", periods: ["FY2026"],
    income: [{ line: "Revenue", values: [64] }],
    balance: [{ line: "Total assets", values: [139] }],
    cashFlow: [{ line: "Free cash flow", values: [12] }] };
  const svHist = await serverCall(histOnly);
  check("server flags a missing forecast when historicals arrived",
    /MISSING: the forecast/.test(svHist.content[0].text), true);
  check("  every response carries the workbook route",
    /Download workbook \(.xlsx\)/.test(svHist.content[0].text), true);
}

console.log("\nthe workbook");

// The workbook must be a genuine .xlsx: a well-formed zip whose sheets parse
// as XML and carry the worksheet's numbers. Validated with an independent
// implementation (Python's zipfile), not with the code that wrote it.
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");

  const wbFixture = clone();
  wbFixture.financials = { unit: "$B", periods: ["FY2025", "FY2026"],
    income: [{ line: "Revenue", values: [60, 64.5] }],
    balance: [{ line: "Total assets", values: [130, 139] }],
    cashFlow: [{ line: "Free cash flow", values: [11, 12.1] }],
    forecast: { periods: ["FY2027E", "FY2028E"],
      basis: "Base-case scenario: revenue +6%, FCF margin to 20%.",
      income: [{ line: "Revenue", values: [68, 72] }],
      balance: [{ line: "Total equity", values: [32, 35] }],
      cashFlow: [{ line: "Free cash flow", values: [13.4, 15] }] } };

  const booted = bootWidget(wbFixture, null);
  check("widget exposes a workbook builder", typeof booted.buildWorkbook, "function");

  const bytes = booted.buildWorkbook();
  check("workbook is non-trivial", bytes instanceof Uint8Array && bytes.length > 2000, true);

  const path = "/tmp/mos-wb-test.xlsx";
  writeFileSync(path, bytes);
  const py = spawnSync("python3", ["-c", `
import zipfile, xml.dom.minidom, sys
z = zipfile.ZipFile("${path}")
assert z.testzip() is None, "corrupt entry"
names = z.namelist()
for part in ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
             "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml",
             "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]:
    assert part in names, "missing " + part
for n in names:
    xml.dom.minidom.parseString(z.read(n))   # every part is well-formed XML
s1 = z.read("xl/worksheets/sheet1.xml").decode()
s3 = z.read("xl/worksheets/sheet3.xml").decode()
assert "Testco" in s1, "company missing from Valuation"
assert "8.5" in s1, "live K missing from Valuation"
assert "FY2027E" in s3 and "Base-case scenario" in s3, "forecast content missing"
print("xlsx-ok")
`], { encoding: "utf8" });
  if (py.error && py.error.code === "ENOENT") {
    console.log("  skip  python3 not available for independent validation");
  } else {
    check("independent reader opens it and finds the numbers",
      (py.stdout || "").trim(), "xlsx-ok");
    if ((py.stdout || "").trim() !== "xlsx-ok") console.error(py.stderr);
  }
  rmSync(path, { force: true });

  check("forecast renders in the widget",
    /FORECAST — GROUNDED IN THE SCENARIO ANALYSIS/.test(booted.rootHtml)
      && /FY2027E/.test(booted.rootHtml) && /Basis:/.test(booted.rootHtml), true);

  const noFc = clone();
  noFc.financials = { unit: "$B", periods: ["FY2026"],
    income: [{ line: "Revenue", values: [64.5] }],
    balance: [{ line: "Total assets", values: [139] }],
    cashFlow: [{ line: "Free cash flow", values: [12.1] }] };
  check("missing forecast is named, not hidden",
    /Forecast not supplied on this run/.test(bootWidget(noFc, null).rootHtml), true);
}

console.log("\ndata source priority");

// The widget must render the server-validated worksheet when the host
// provides it, not the model's raw arguments. toolOutput K=9 with a raw
// toolInput K=8.5 proves which one won.
{
  const validated = clone(); validated.K = 9;
  const { doc, byId } = fakeDom();
  const open2 = WIDGET_HTML.indexOf('<script type="module">');
  const src2 = WIDGET_HTML.slice(open2 + '<script type="module">'.length,
    WIDGET_HTML.indexOf("</script>", open2));
  const win2 = {
    openai: { toolInput: clone(), toolOutput: { worksheet: validated },
      widgetState: null, theme: "dark", setWidgetState() {} },
    addEventListener() {}, matchMedia: () => ({ matches: false }),
    setInterval: () => 0, clearInterval: () => {},
  };
  new Function("window", "document", "setInterval", "clearInterval", src2)(
    win2, doc, () => 0, () => {});
  check("prefers the server-validated toolOutput over raw toolInput",
    byId.get("k-val")?.textContent ?? "", "9%");
}

console.log("\ndisplay honesty");

check("the header reports the K actually in use", poisoned.hdrK, poisoned.k);
check("persisted state carries its scope", clean.saved, undefined);

console.log("\n" + (failures ? failures + " FAILURE(S)" : "all passed"));
process.exit(failures ? 1 : 0);

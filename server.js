/* ============================================================
   Margin of Safety — MCP server for ChatGPT (Apps SDK).

   Speaks MCP over streamable HTTP at POST /mcp. Written against
   the standard fetch interface (Request in, Response out), so the
   same file runs on Cloudflare Workers, Deno Deploy and Vercel
   Edge directly, and on Node through node-server.mjs.

   IT HOLDS NO API KEY AND RUNS NO INFERENCE. ChatGPT researches
   the company on the user's own account and calls the tool with a
   finished worksheet; this server echoes it back and serves the
   widget that draws it.
   ============================================================ */

import { WORKSHEET_SCHEMA, TOOL_NAME, TOOL_DESCRIPTION } from "./schema.js";
import { WIDGET_HTML } from "./widget.js";

const SERVER_NAME = "margin-of-safety";
const SERVER_VERSION = "1.0.0";
// The URI doubles as ChatGPT's cache key for the rendered component, so it
// carries a version: bump it whenever the widget changes shape, or hosts keep
// serving the copy they cached.
const WIDGET_URI = "ui://margin-of-safety/worksheet-v9.html";
// ChatGPT stores the template URI when an app is installed and keeps asking
// for that exact pointer; it does not follow a rename. Any install made before
// a URI change would 404 with "Failed to fetch template", so old pointers stay
// served as aliases of the current widget. Add to this list, never remove.
const LEGACY_WIDGET_URIS = [
  "ui://widget/margin-of-safety.html",
  "ui://margin-of-safety/worksheet-v2.html",
  "ui://margin-of-safety/worksheet-v3.html",
  "ui://margin-of-safety/worksheet-v4.html",
  "ui://margin-of-safety/worksheet-v5.html",
  "ui://margin-of-safety/worksheet-v6.html",
  "ui://margin-of-safety/worksheet-v7.html",
  "ui://margin-of-safety/worksheet-v8.html",
];
// Required exactly. An unrecognised type renders as "Error loading app".
const WIDGET_MIME = "text/html;profile=mcp-app";
const DEFAULT_PROTOCOL = "2025-06-18";

/* ---------- HTTP plumbing ---------- */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-session-id, mcp-protocol-version",
  "access-control-expose-headers": "mcp-session-id",
  "access-control-max-age": "86400",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

const rpcResult = (id, result) => json({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) =>
  json({ jsonrpc: "2.0", id, error: { code, message } });

/* ---------- the widget resource ---------- */

// `domain` is the sandbox origin ChatGPT renders the widget in. It wants one
// unique origin per app: optional for developer-mode use, required to submit
// to the directory. Derived from the request so this file stays portable
// across hosts; set a WIDGET_DOMAIN binding to override when the widget moves
// to an origin of its own.
function widgetResource(origin) {
  return {
    uri: WIDGET_URI,
    name: "Margin of Safety worksheet",
    description: "Interactive NAV / EPV / GV expected-value dashboard.",
    mimeType: WIDGET_MIME,
    _meta: {
      // The widget is fully self-contained: no network calls, no external assets.
      ui: {
        domain: origin,
        // No host card: the widget paints no ground of its own and sits
        // directly on the conversation surface. prefersBorder asks ChatGPT
        // to wrap it in a panel — the grey box, on some builds.
        prefersBorder: false,
        csp: { connectDomains: [], resourceDomains: [] },
      },
      "openai/widgetDomain": origin,
      "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
    },
  };
}

const TOOL = {
  name: TOOL_NAME,
  title: "Margin of Safety worksheet",
  description: TOOL_DESCRIPTION,
  inputSchema: WORKSHEET_SCHEMA,
  // Declares the shape the widget is handed back, so the host can validate
  // structuredContent instead of guessing at it.
  outputSchema: {
    type: "object",
    required: ["worksheet"],
    properties: { worksheet: WORKSHEET_SCHEMA },
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  _meta: {
    ui: { resourceUri: WIDGET_URI },
    "openai/outputTemplate": WIDGET_URI,
    "openai/toolInvocation/invoking": "Drawing the worksheet",
    "openai/toolInvocation/invoked": "Worksheet ready",
    "openai/widgetAccessible": true,
  },
};

/* ---------- worksheet checks ---------- */

// The one input mistake models make over and over: rates as decimal
// fractions (0.085 for 8.5%) where the contract says percentage points.
// Rejecting it does not protect anyone here — on this host a rejected call
// still paints a widget, so a validation error turns into a retry and TWO
// dashboards, one of them wrong. The mistake is unambiguous (no real cost of
// capital is 0.085%), so read it as intended, and say so in the output where
// the model and the reader can both see it.
function normalizeUnits(w) {
  const notes = [];
  const asPct = (n) => Math.round(n * 100 * 1000) / 1000;
  if (w && typeof w.K === "number" && w.K > 0 && w.K < 1) {
    notes.push("K = " + w.K + " read as " + asPct(w.K) + "% (rates are percentage points)");
    w.K = asPct(w.K);
  }
  if (w && Array.isArray(w.scenarios)) {
    let sum = 0, allNum = true;
    for (const s of w.scenarios) {
      if (!s) { allNum = false; continue; }
      if (typeof s.g === "number" && s.g !== 0 && Math.abs(s.g) < 1) {
        notes.push((s.name || "scenario") + ": G = " + s.g + " read as " + asPct(s.g) + "%");
        s.g = asPct(s.g);
      }
      if (typeof s.margin === "number" && s.margin !== 0 && Math.abs(s.margin) < 1) {
        notes.push((s.name || "scenario") + ": margin = " + s.margin + " read as " + asPct(s.margin) + "%");
        s.margin = asPct(s.margin);
      }
      const p = Number(s.prob);
      if (isFinite(p)) sum += p; else allNum = false;
    }
    // Probabilities that sum to ~1 are fractions of the same mistake.
    if (allNum && sum > 0.98 && sum < 1.02) {
      for (const s of w.scenarios) s.prob = asPct(Number(s.prob));
      notes.push("probabilities summed to 1; read as percentages");
    }
  }
  return notes;
}

// Cheap structural checks. The schema does the heavy lifting; this catches
// the two mistakes that would render a misleading dashboard rather than fail.
function validate(w) {
  const problems = [];
  if (!w || typeof w !== "object") return ["No worksheet was supplied."];
  if (!Array.isArray(w.scenarios) || w.scenarios.length !== 5) {
    problems.push("scenarios must be an array of exactly five entries.");
  }
  if (!w.mark || typeof w.mark.value !== "number" || !isFinite(w.mark.value) || w.mark.value <= 0) {
    problems.push("mark.value must be a positive number of $B.");
  }
  // Percentage points, not fractions. A K of 0.08 meaning 8% divides by
  // 0.0008 and returns a valuation in the tens of trillions, which looks like
  // a real answer rather than a unit error. Reject it at the door.
  if (typeof w.K !== "number" || w.K < 1 || w.K > 30) {
    problems.push(
      "K must be in percentage points between 1 and 30 (pass 11 for 11%, not 0.11). Received: " + w.K
    );
  }
  if (Array.isArray(w.scenarios)) {
    const total = w.scenarios.reduce((a, s) => a + (Number(s && s.prob) || 0), 0);
    if (Math.abs(total - 100) > 1) {
      problems.push("Scenario probabilities sum to " + total + "; they must sum to 100.");
    }
    w.scenarios.forEach((s, i) => {
      if (!s) return;
      if (s.type === "gv" && typeof s.g === "number" && typeof w.K === "number" && s.g >= w.K) {
        problems.push("Scenario " + (i + 1) + " has G >= K, which does not converge. Lower g below K.");
      }
      if (s.type === "epv" && s.margin != null && Math.abs(Number(s.margin)) < 1 && Number(s.margin) !== 0) {
        problems.push(
          "Scenario " + (i + 1) + " has margin " + s.margin + ", which looks like a fraction. "
          + "Margins are percentage points: pass 18 for 18%, not 0.18."
        );
      }
      if (s.type === "epv" && s.fcf == null && (s.rev == null || s.margin == null)) {
        problems.push("Scenario " + (i + 1) + " is epv but supplies neither fcf nor rev+margin.");
      }
      if (s.type === "nav" && s.value == null) {
        problems.push("Scenario " + (i + 1) + " is nav but supplies no value.");
      }
    });
  }
  return problems;
}

// Mirror of the widget's engine, so the text summary the model reads agrees
// with the dashboard the user sees.
function expectedValue(w) {
  const baseYear = new Date().getFullYear();
  const k = w.K / 100;
  const vals = w.scenarios.map((s) => {
    const years = Math.max(0, (Number(s.year) || baseYear) - baseYear);
    const add = Number(s.addBack || 0);
    if (s.type === "nav") return Number(s.value || 0);
    if (s.type === "epv") {
      const F = s.fcf != null ? Number(s.fcf) : Number(s.rev || 0) * Number(s.margin || 0) / 100;
      return (F / k) / Math.pow(1 + k, years) + add;
    }
    const g = Math.min(Number(s.g || 0) / 100, k - 0.005);
    return (Number(s.d || 0) / (k - g)) / Math.pow(1 + k, years) + add;
  });
  const total = w.scenarios.reduce((a, s) => a + (Number(s.prob) || 0), 0) || 1;
  const ev = vals.reduce((a, v, i) => a + v * (Number(w.scenarios[i].prob) || 0) / total, 0);
  return { vals, ev };
}

const fmtB = (v) => {
  if (!isFinite(v)) return "n/a";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1000) return sign + "$" + (a / 1000).toFixed(2) + "T";
  if (a >= 100) return sign + "$" + Math.round(a) + "B";
  if (a >= 10) return sign + "$" + a.toFixed(1) + "B";
  return sign + "$" + a.toFixed(2) + "B";
};

/* ---------- the workbook script ----------
   ChatGPT's code tool has openpyxl preinstalled. Every tool response carries
   a complete script — worksheet data embedded, nothing for the model to fill
   in — so producing the Excel file is an execution step, not a judgment
   call. The Valuation sheet is a live model: K and the weights are editable
   cells, scenario values are formulas against them, mirroring the widget. */

function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function workbookScript(worksheet) {
  const baseYear = new Date().getFullYear();
  const payload = toB64(JSON.stringify(worksheet));
  return [
    "import json, base64, re",
    "from openpyxl import Workbook",
    "from openpyxl.styles import Font",
    "",
    'W = json.loads(base64.b64decode("' + payload + '").decode("utf-8"))',
    "BASE_YEAR = " + baseYear,
    "",
    "wb = Workbook()",
    'va = wb.active; va.title = "Valuation"',
    'bold = Font(bold=True)',
    'va["A1"] = "Margin of Safety — " + W["company"]; va["A1"].font = Font(bold=True, size=14)',
    'va["A2"] = W["status"] + " · as of " + W["asOf"]',
    'va["A4"] = "K — cost of capital (%)  [EDIT ME]"; va["B4"] = float(W["K"]); va["B4"].font = bold',
    'va["A5"] = "Mark ($B)"; va["B5"] = float(W["mark"]["value"]); va["C5"] = W["mark"]["label"]',
    "",
    'hdr = ["#", "Scenario", "Rule", "Type", "Weight %  [EDIT ME]", "Inputs", "Value today ($B)", "Contribution ($B)"]',
    "for c, h in enumerate(hdr, 1):",
    "    cell = va.cell(row=7, column=c, value=h); cell.font = bold",
    "",
    "first, last = 8, 7 + len(W[\"scenarios\"])",
    'for r, sc in enumerate(W["scenarios"], first):',
    "    years = max(0, int(sc.get(\"year\", BASE_YEAR)) - BASE_YEAR)",
    "    add = float(sc.get(\"addBack\", 0) or 0)",
    '    k = "($B$4/100)"',
    '    disc = "POWER(1+" + k + "," + str(years) + ")"',
    '    if sc["type"] == "nav":',
    '        formula = "=" + str(float(sc.get("value", 0) or 0))',
    '        inputs = "NAV " + str(sc.get("value")) + "B"',
    '    elif sc["type"] == "epv":',
    '        F = str(float(sc["fcf"])) if sc.get("fcf") is not None else "(" + str(float(sc.get("rev", 0) or 0)) + "*" + str(float(sc.get("margin", 0) or 0)) + "/100)"',
    '        formula = "=(" + F + "/" + k + ")/" + disc + "+" + str(add)',
    '        inputs = ("FCF " + str(sc.get("fcf")) + "B" if sc.get("fcf") is not None else str(sc.get("rev")) + "B x " + str(sc.get("margin")) + "%") + " @" + str(sc.get("year"))',
    "    else:",
    '        g = str(float(sc.get("g", 0) or 0))',
    '        formula = "=(" + str(float(sc.get("d", 0) or 0)) + "/(" + k + "-MIN(" + g + "/100," + k + "-0.005)))/" + disc + "+" + str(add)',
    '        inputs = "D " + str(sc.get("d")) + "B, G " + str(sc.get("g")) + "% @" + str(sc.get("year"))',
    "    va.cell(row=r, column=1, value=r - first + 1)",
    '    va.cell(row=r, column=2, value=sc["name"])',
    '    va.cell(row=r, column=3, value=sc.get("rule", ""))',
    '    va.cell(row=r, column=4, value=sc["type"])',
    '    va.cell(row=r, column=5, value=float(sc.get("prob", 0) or 0))',
    "    va.cell(row=r, column=6, value=inputs)",
    "    va.cell(row=r, column=7, value=formula)",
    '    va.cell(row=r, column=8, value="=G" + str(r) + "*E" + str(r) + "/SUM($E$" + str(first) + ":$E$" + str(last) + ")")',
    "",
    "ev_row = last + 1",
    'va.cell(row=ev_row, column=2, value="EXPECTED VALUE").font = bold',
    'va.cell(row=ev_row, column=8, value="=SUM(H" + str(first) + ":H" + str(last) + ")").font = bold',
    'va.cell(row=ev_row + 1, column=2, value="E(V) as % of mark")',
    'va.cell(row=ev_row + 1, column=8, value="=H" + str(ev_row) + "/B5")',
    'va.cell(row=ev_row + 3, column=1, value="Edit B4 (K) or column E (weights): every value recomputes, as on the worksheet.")',
    'va.cell(row=ev_row + 4, column=1, value="Model-generated estimates from public reporting. Not investment advice.")',
    "for col, w in zip(\"ABCDEFGH\", (4, 28, 34, 6, 12, 30, 18, 18)):",
    "    va.column_dimensions[col].width = w",
    "",
    "def statements(ws, block, periods, unit, start=1):",
    "    r = start",
    '    for title, key in (("Income statement", "income"), ("Balance sheet", "balance"), ("Cash flow", "cashFlow")):',
    "        lines = block.get(key) or []",
    "        if not lines: continue",
    '        ws.cell(row=r, column=1, value=title + " (" + unit + ")").font = bold',
    "        for c, plabel in enumerate(periods, 2):",
    "            ws.cell(row=r, column=c, value=plabel).font = bold",
    "        r += 1",
    "        for line in lines:",
    '            ws.cell(row=r, column=1, value=line["line"])',
    '            for c, v in enumerate(line.get("values") or [], 2):',
    "                if isinstance(v, (int, float)): ws.cell(row=r, column=c, value=v)",
    "            r += 1",
    "        r += 1",
    '    ws.column_dimensions["A"].width = 30',
    "    return r",
    "",
    'f = W.get("financials") or {}',
    'hist = wb.create_sheet("Historical")',
    'if f.get("periods"): statements(hist, f, f["periods"], f.get("unit", "$B"))',
    'else: hist["A1"] = "Historicals were not supplied on this run."',
    'fc = f.get("forecast") or {}',
    'fore = wb.create_sheet("Forecast")',
    'if fc.get("periods"):',
    '    fore["A1"] = "Basis: " + fc.get("basis", "not stated")',
    '    statements(fore, fc, fc["periods"], f.get("unit", "$B"), start=3)',
    'else: fore["A1"] = "A forecast was not supplied on this run."',
    "",
    'path = "/mnt/data/" + re.sub(r"\\W+", "_", W["company"]) + "_margin_of_safety.xlsx"',
    "wb.save(path)",
    "print(path)",
  ].join("\n");
}

/* ---------- JSON-RPC dispatch ---------- */

function dispatch(msg, origin) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize": {
      const requested = params && params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: typeof requested === "string" ? requested : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Use " + TOOL_NAME + " to draw an intrinsic-value worksheet after you have " +
          "researched the company and computed the five scenarios yourself.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: [TOOL] });

    case "resources/list":
      return rpcResult(id, { resources: [widgetResource(origin)] });

    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });

    case "resources/read": {
      const uri = params && params.uri;
      if (uri !== WIDGET_URI && !LEGACY_WIDGET_URIS.includes(uri)) {
        return rpcError(id, -32602, "Unknown resource: " + uri);
      }
      return rpcResult(id, {
        contents: [{
          // Echo the URI that was asked for: the caller matches the response
          // against its own pointer.
          uri,
          mimeType: WIDGET_MIME,
          text: WIDGET_HTML,
          _meta: widgetResource(origin)._meta,
        }],
      });
    }

    case "tools/call": {
      const name = params && params.name;
      if (name !== TOOL_NAME) {
        return rpcError(id, -32602, "Unknown tool: " + name);
      }
      const worksheet = (params && params.arguments) || {};
      const unitNotes = normalizeUnits(worksheet);
      const problems = validate(worksheet);

      if (problems.length) {
        return rpcResult(id, {
          isError: true,
          content: [{
            type: "text",
            text: "The worksheet could not be drawn:\n- " + problems.join("\n- ")
              + "\nFix these and call the tool again.",
          }],
        });
      }

      // The statements are required by the schema, but a host that enforces
      // required fields loosely can still deliver a call without them.
      // Rejecting would paint a second widget (every invocation renders), so
      // accept, and make the absence loud: name it in the output and tell the
      // model to put the statements in its text reply — NOT to call again.
      const f = worksheet.financials;
      const hasStatements = !!(f && Array.isArray(f.periods) && f.periods.length
        && Array.isArray(f.income) && f.income.length
        && Array.isArray(f.balance) && f.balance.length
        && Array.isArray(f.cashFlow) && f.cashFlow.length);
      const fc = f && f.forecast;
      const hasForecast = !!(fc && Array.isArray(fc.periods) && fc.periods.length
        && Array.isArray(fc.income) && fc.income.length
        && Array.isArray(fc.cashFlow) && fc.cashFlow.length);

      const { ev, vals } = expectedValue(worksheet);
      const pct = Math.round((ev / worksheet.mark.value) * 100);
      const total = worksheet.scenarios.reduce((a, x) => a + (Number(x.prob) || 0), 0) || 1;

      // The full model goes into the transcript, not just a headline. A
      // valuation the reader cannot audit is worse than no valuation: when a
      // unit error puts a company at $50T, the only way to catch it is to see
      // the inputs, the rule applied, and the arithmetic side by side.
      const inputsOf = (x) => {
        const at = " @" + x.year + (x.addBack ? ", " + (x.addBack >= 0 ? "+" : "") + x.addBack + "B interim" : "");
        if (x.type === "nav") return "NAV " + x.value + "B";
        if (x.type === "epv") {
          return (x.fcf != null ? "FCF " + x.fcf + "B" : x.rev + "B x " + x.margin + "%") + " / K" + at;
        }
        return "D " + x.d + "B / (K-" + x.g + "%)" + at;
      };

      const rows = worksheet.scenarios.map((x, i) => {
        const p = (Number(x.prob) || 0) / total;
        return "| " + (i + 1) + " | " + x.name + " | " + x.rule + " | " + inputsOf(x)
          + " | " + fmtB(vals[i]) + " | " + Math.round(p * 100) + "% | " + fmtB(p * vals[i]) + " |";
      });

      const summary = [
        worksheet.company + " (" + worksheet.status + ", as of " + worksheet.asOf + ")",
        "",
        "**Expected value " + fmtB(ev) + " against a mark of " + fmtB(worksheet.mark.value)
          + "** — " + pct + "% of the mark, a "
          + (ev >= worksheet.mark.value ? "premium" : "discount") + " of "
          + fmtB(Math.abs(worksheet.mark.value - ev)) + ".",
        "",
        "K = " + worksheet.K + "% (" + worksheet.kRationale + "). Values are capitalised at the",
        "steady-state year then discounted to today at K. All figures in $B unless marked T.",
        "",
        "| # | Scenario | Rule | Inputs | Value today | Prob | Contribution |",
        "|---|---|---|---|---|---|---|",
        ...rows,
        "| | **Expected value** | Sum of p x V | | | 100% | **" + fmtB(ev) + "** |",
        "",
        "Incremental ROIC: " + worksheet.roicTest.verdict,
        "",
        "The interactive worksheet is on screen: drag the probabilities, change K, and edit any",
        "scenario's assumptions to see the expected value move.",
        ...(unitNotes.length ? ["", "Unit note: " + unitNotes.join("; ") + "."] : []),
        ...(hasStatements ? [] : ["",
          "MISSING: the three statements (income, balance sheet, cash flow) were not "
          + "supplied, so the worksheet shows the valuation without its evidence base. "
          + "Do NOT call the tool again for this company. Instead, include the three "
          + "statements as markdown tables in your text reply, from the filings you "
          + "already researched."]),
        ...(hasStatements && !hasForecast ? ["",
          "MISSING: the forecast. Historicals arrived but no forward model, so the "
          + "bridge from reported numbers to the scenario parameters is not on the "
          + "worksheet. Do NOT call the tool again — put the forecast (income, balance "
          + "sheet, cash flow to the steady-state year, with its basis) as markdown "
          + "tables in your text reply."] : []),
        "",
        "DELIVER THE WORKBOOK NOW. Run the Python below with your code tool exactly "
          + "as written — the worksheet data is embedded, nothing to fill in — and "
          + "attach the resulting .xlsx file to your reply (the script prints its "
          + "path). In the workbook, K and the scenario weights are editable cells "
          + "and every value is a formula, so it recalculates in Excel just like the "
          + "on-screen worksheet. Do not re-call this tool, do not retype the "
          + "numbers, do not edit the script. If code execution is unavailable in "
          + "this conversation, say so and point at the worksheet's 'Download "
          + "workbook (.xlsx)' button instead.",
        "",
        "```python",
        workbookScript(worksheet),
        "```",
      ].join("\n");

      return rpcResult(id, {
        content: [{ type: "text", text: summary }],
        // The widget reads the worksheet from toolInput; this is the documented
        // fallback path (toolOutput) so the dashboard still draws if the host
        // does not surface tool arguments to the frame.
        structuredContent: { worksheet },
        _meta: { "openai/outputTemplate": WIDGET_URI },
      });
    }

    default:
      return rpcError(id, -32601, "Method not found: " + method);
  }
}

/* ---------- request handler ---------- */

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = (env && env.WIDGET_DOMAIN) || url.origin;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (url.pathname === "/health") {
    return json({ ok: true, server: SERVER_NAME, version: SERVER_VERSION });
  }

  if (url.pathname === "/" && request.method === "GET") {
    return new Response(
      "Margin of Safety — MCP server for ChatGPT.\n\n" +
      "Add " + url.origin + "/mcp as a developer-mode app in ChatGPT:\n" +
      "Settings -> Connectors -> Advanced -> Developer mode, then create an app\n" +
      "pointing at that URL.\n\nThis server stores no keys and runs no inference.\n",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } }
    );
  }

  if (url.pathname !== "/mcp") {
    return json({ error: "Not found. The MCP endpoint is /mcp." }, 404);
  }

  // Server-initiated streams are not used; every response is a direct reply.
  if (request.method === "GET") {
    return new Response("This endpoint replies to POSTed JSON-RPC only.", {
      status: 405,
      headers: { "content-type": "text/plain; charset=utf-8", allow: "POST, OPTIONS", ...CORS },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  // A batch is legal JSON-RPC; handle it rather than choke on it.
  if (Array.isArray(payload)) {
    const replies = [];
    for (const msg of payload) {
      if (msg && msg.id === undefined) continue;      // notification
      const res = dispatch(msg || {}, origin);
      replies.push(await res.json());
    }
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
  }

  // Notifications (no id) get an acknowledgement with no body.
  if (!payload || payload.id === undefined) {
    return new Response(null, { status: 202, headers: CORS });
  }

  try {
    return dispatch(payload, origin);
  } catch (e) {
    return rpcError(payload.id, -32603, "Internal error: " + (e && e.message));
  }
}

export default { fetch: handleRequest };

/* ============================================================
   Margin of Safety — tool contract.

   The input schema IS the valuation worksheet. ChatGPT does the
   research on the user's own account and calls the tool with a
   completed analysis; the server never runs inference and holds
   no API key.
   ============================================================ */

const str = (description) => ({ type: "string", description });
const num = (description) => ({ type: "number", description });

const row = (props, required) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties: props,
});

export const WORKSHEET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "company", "status", "asOf", "headline", "mark", "K", "kRationale",
    "sectionA", "sectionB", "sectionC", "financials", "roicTest", "scenarios",
    "presets", "impliedProbs", "tradeSetup", "sources",
  ],
  properties: {
    company: str("Company name."),
    status: str("Listing status, e.g. 'public NYSE: XYZ' or 'private'."),
    asOf: str("Date the research reflects, e.g. 'August 12, 2026'. Use the date of your sources, not today's date, if they differ."),
    headline: str("One sentence naming the central valuation tension."),

    mark: row({
      value: num("The market mark in $B. Market capitalization if public; latest post-money or tender price if private."),
      label: str("What the mark is, e.g. 'Series D, Feb 2026, post-money'."),
      multiple: str("The mark as a multiple, e.g. '~355x run-rate revenue'."),
    }, ["value", "label", "multiple"]),

    K: { type: "number", minimum: 1, maximum: 30,
      description: "Cost of capital in PERCENTAGE POINTS, not a decimal fraction: pass 11 for 11%, never 0.11. Use 10-12: 11 if self-funding or asset-backed, 12 if financing-dependent and pre-profit. Go lower only with strong justification." },
    kRationale: str("One sentence justifying K."),

    sectionA: {
      type: "array", minItems: 4, maxItems: 6,
      description: "Thesis generation: framework signals and what the research actually found.",
      items: row({
        signal: str("Framework signal name."),
        observed: str("What you found, with numbers."),
      }, ["signal", "observed"]),
    },

    sectionB: row({
      rows: {
        type: "array", minItems: 4, maxItems: 6,
        description: "Micro due diligence on the revenue model.",
        items: row({
          line: str("Line item, e.g. 'Revenue'."),
          figure: str("The figure, e.g. '$4.2B'."),
          notes: str("Detail with numbers."),
        }, ["line", "figure", "notes"]),
      },
      risks: str("Numbered risks to cash generation, as one paragraph."),
      governance: str("Management and governance, as one paragraph."),
    }, ["rows", "risks", "governance"]),

    sectionC: {
      type: "array", minItems: 5, maxItems: 5,
      description: "Macro due diligence. Exactly five factors: market size and growth, historical industry returns, unit economics, competitive position, cyclicality.",
      items: row({
        factor: str("Factor name."),
        assessment: str("Your assessment, with numbers where possible."),
      }, ["factor", "assessment"]),
    },

    roicTest: row({
      lines: {
        type: "array", minItems: 2, maxItems: 5,
        description: "Evidence lines: capital consumed recently vs. revenue or gross profit added.",
        items: { type: "string" },
      },
      verdict: str("Whether incremental ROIC sits above or below K, as a Case 2 or Case 3 verdict sentence."),
    }, ["lines", "verdict"]),

    scenarios: {
      type: "array", minItems: 5, maxItems: 5,
      description:
        "Exactly five scenarios, in this order: 1) Catastrophe, NAV at liquidation. " +
        "2) Commoditization, max(NAV, EPV) capped at replacement cost. " +
        "3) Moat around the current business, EPV. " +
        "4) Moat around new investment, GV via P = D/(K-G). " +
        "5) Transformative tail, GV with extreme PVGO. " +
        "Probabilities must sum to 100.",
      items: row({
        name: str("Scenario name."),
        rule: str("The framework rule it earns, e.g. 'EPV' or 'GV = EPV + PVGO'."),
        desc: str("What happens in this scenario. Under 220 characters."),
        type: { type: "string", enum: ["nav", "epv", "gv"], description: "Valuation method. 'nav' needs value. 'epv' needs fcf, or rev and margin, plus year and addBack. 'gv' needs d, g, year and addBack." },
        prob: { type: "number", minimum: 0, maximum: 100,
          description: "Probability weight in percentage points, 0-100. The five must sum to 100." },
        value: num("nav only: liquidation value in $B."),
        fcf: num("epv only: normalized steady-state free cash flow in $B."),
        rev: num("epv only, when using a margin: steady-state revenue in $B."),
        margin: { type: "number", minimum: -100, maximum: 100,
          description: "epv only, when using revenue: FCF margin in PERCENTAGE POINTS, not a decimal fraction: pass 18 for 18%, never 0.18." },
        d: num("gv only: distributable cash flow D in $B."),
        g: { type: "number", minimum: -10, maximum: 10,
          description: "gv only: perpetual growth G in PERCENTAGE POINTS, not a decimal fraction: pass 4 for 4%, never 0.04. Must be below K or the perpetuity does not converge." },
        year: num("epv and gv: the steady-state year the value is capitalized at."),
        addBack: num("epv and gv: interim FCF or residual cash in $B. May be negative."),
      }, ["name", "rule", "desc", "type", "prob"]),
    },

    presets: row({
      base: { type: "array", minItems: 5, maxItems: 5, items: { type: "number" }, description: "Your base-case weights." },
      bear: { type: "array", minItems: 5, maxItems: 5, items: { type: "number" }, description: "A bear-case weighting." },
      marketImplied: { type: "array", minItems: 5, maxItems: 5, items: { type: "number" }, description: "Weights that roughly reproduce the mark, or your closest attempt." },
    }, ["base", "bear", "marketImplied"]),

    financials: row({
      unit: str("Unit for every figure below, e.g. '$B' or '$M'. Use the same unit throughout."),
      periods: {
        type: "array", minItems: 2, maxItems: 4,
        description: "Fiscal periods, oldest first, e.g. ['FY2024', 'FY2025', 'FY2026 TTM'].",
        items: { type: "string" },
      },
      income: {
        type: "array", minItems: 3, maxItems: 7,
        description: "Income statement. Include at least Revenue, Operating income and Net income; add Gross profit and Operating expenses where known.",
        items: row({
          line: str("Line item name."),
          values: { type: "array", minItems: 2, maxItems: 4, items: { type: "number" },
            description: "One figure per period, in the same order as `periods`. Negative for outflows and losses." },
        }, ["line", "values"]),
      },
      balance: {
        type: "array", minItems: 3, maxItems: 7,
        description: "Balance sheet. Include at least Cash and equivalents, Total assets, Total debt and Total equity.",
        items: row({
          line: str("Line item name."),
          values: { type: "array", minItems: 2, maxItems: 4, items: { type: "number" },
            description: "One figure per period, in the same order as `periods`." },
        }, ["line", "values"]),
      },
      cashFlow: {
        type: "array", minItems: 3, maxItems: 7,
        description: "Cash flow statement. Include at least Operating cash flow, Capital expenditure (negative) and Free cash flow.",
        items: row({
          line: str("Line item name."),
          values: { type: "array", minItems: 2, maxItems: 4, items: { type: "number" },
            description: "One figure per period, in the same order as `periods`. Negative for outflows." },
        }, ["line", "values"]),
      },
      forecast: row({
        periods: {
          type: "array", minItems: 2, maxItems: 5,
          description: "Forecast fiscal periods, nearest first, marked as estimates, e.g. ['FY2027E', 'FY2028E', 'FY2029E']. Extend at least to the steady-state year used in scenarios 3-4.",
          items: { type: "string" },
        },
        basis: str("One or two sentences stating the drivers: revenue growth assumed, margin path, capex intensity — and which scenario the path reflects (normally the probability-weighted base case). The forecast MUST reconcile with the scenario inputs: steady-state FCF here should land at the fcf / rev x margin / d figures used in the scenarios."),
        income: {
          type: "array", minItems: 3, maxItems: 7,
          description: "Forecast income statement, same line items as the historical one where possible.",
          items: row({
            line: str("Line item name."),
            values: { type: "array", minItems: 2, maxItems: 5, items: { type: "number" },
              description: "One figure per forecast period, in the same order as forecast periods." },
          }, ["line", "values"]),
        },
        balance: {
          type: "array", minItems: 3, maxItems: 7,
          description: "Forecast balance sheet (condensed): at least Cash, Total debt, Total equity.",
          items: row({
            line: str("Line item name."),
            values: { type: "array", minItems: 2, maxItems: 5, items: { type: "number" } },
          }, ["line", "values"]),
        },
        cashFlow: {
          type: "array", minItems: 3, maxItems: 7,
          description: "Forecast cash flow: at least Operating cash flow, Capital expenditure (negative), Free cash flow. Free cash flow at the steady-state year must match the scenario parameters.",
          items: row({
            line: str("Line item name."),
            values: { type: "array", minItems: 2, maxItems: 5, items: { type: "number" } },
          }, ["line", "values"]),
        },
      }, ["periods", "basis", "income", "balance", "cashFlow"]),
    }, ["unit", "periods", "income", "balance", "cashFlow", "forecast"]),

    impliedProbs: str("Invert the market price: what probability distribution does the mark require, and is it reachable at all?"),
    tradeSetup: str("Crowding, counterparty, catalysts to watch, and honest bull and bear counterpoints."),
    sources: str("One paragraph listing the sources you relied on."),
  },
};

export const TOOL_NAME = "render_margin_of_safety_worksheet";

export const TOOL_DESCRIPTION = [
  "Renders an interactive intrinsic-value worksheet (NAV / EPV / GV, probability-weighted) as a dashboard the user can manipulate: they can drag the scenario probabilities, change the cost of capital, and edit each scenario's assumptions, and the expected value recomputes live against the market mark.",
  "",
  "Call this whenever the user asks what a company is worth, asks for an intrinsic value, a valuation, a DCF-style analysis, or a margin of safety on a specific company — public or private.",
  "",
  "CALL THIS EXACTLY ONCE per company, when your research is finished and your numbers are final. Every call paints another worksheet in the conversation, so a second call leaves the user with two contradictory dashboards. Do not call it to explore variations — the user changes assumptions on the worksheet itself.",
  "",
  "BEFORE CALLING: do the research yourself. Search the web for the company's latest revenue or run-rate, margins, burn or free cash flow, most recent funding round or market capitalization, competitive position, governance, and risks. Pull the three statements — income statement, balance sheet and cash flow statement — for the last two to four reported periods, and pass them in `financials`. Then build the forward model: project the same three statements out to the steady-state year your scenarios use, and pass them in `financials.forecast` with a `basis` naming the drivers. The forecast is not decoration — it is the bridge between the reported numbers and the scenario parameters, so steady-state free cash flow in the forecast must land at the fcf (or rev x margin, or d) figures the scenarios capitalize. Then value it across the five framework scenarios and compute the numbers you pass in. This tool performs no research and no analysis of its own — it only draws what you give it.",
  "",
  "AFTER the tool returns: if the user wants an Excel workbook, build the .xlsx yourself with your file tools, using exactly the numbers from the tool result (structuredContent.worksheet) — historicals, forecast, scenarios, and the expected-value table, one sheet each. Do not re-call the tool for this and do not re-research the figures. The widget also offers a workbook download built from the same numbers.",
  "",
  "Be rigorous and skeptical; do not flatter the company. Every dollar figure is in $B (billions USD). Values are capitalized at the steady-state year, then discounted back to today at K, so scenario parameters must be internally consistent: the dashboard recomputes EPV as (fcf or rev x margin) / K / (1+K)^(year - current year) + addBack, and GV as d / (K - g) / (1+K)^(year - current year) + addBack.",
].join("\n");

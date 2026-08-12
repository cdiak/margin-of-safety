/* ============================================================
   Pre-deploy check for the emitted widget.

   The widget is produced by serialising a function with
   Function.prototype.toString(). That is only safe while the function
   references nothing outside its own body — and a bundler can quietly
   break that rule. esbuild's `keepNames`, which wrangler enables by
   default, rewrites inner functions as `__name(fn, "fn")` and defines
   `__name` at module scope. The serialised copy keeps the calls and
   loses the helper, and the widget dies on load.

   That failure is invisible locally (Node does not bundle) and shows up
   in ChatGPT only as "Error loading app". So: check the emitted HTML
   for identifiers it uses but never defines, and check that it parses.

   Usage:  node check.mjs            # check the local build
           node check.mjs <url>      # check what a deployment serves
   ============================================================ */

import { WIDGET_HTML } from "./widget.js";

const RESOURCE_URI = "ui://margin-of-safety/worksheet-v8.html";

async function fetchDeployed(base) {
  const res = await fetch(base.replace(/\/$/, "") + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "resources/read",
      params: { uri: RESOURCE_URI },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error("resources/read failed: " + body.error.message);
  return body.result.contents[0].text;
}

function scriptBody(html) {
  const open = html.indexOf('<script type="module">');
  if (open === -1) throw new Error('No <script type="module"> in the widget HTML.');
  const start = open + '<script type="module">'.length;
  const end = html.indexOf("</script>", start);
  if (end === -1) throw new Error("Unterminated script block in the widget HTML.");
  return html.slice(start, end);
}

function check(html, label) {
  const problems = [];
  const src = scriptBody(html);

  // Identifiers a bundler injects are conventionally double-underscored.
  // Anything used but not defined in this same script will throw at load.
  // `__PURE__` is only ever an annotation inside a /* @__PURE__ */ comment,
  // never an identifier. A guard that reports things that cannot break gets
  // ignored, and then it stops guarding anything.
  const BENIGN = new Set(["__PURE__"]);
  const used = new Set(
    (src.match(/\b__[A-Za-z_$][\w$]*/g) || []).filter((n) => !BENIGN.has(n))
  );
  const defined = new Set(
    (src.match(/(?:const|let|var|function)\s+(__[A-Za-z_$][\w$]*)/g) || [])
      .map((m) => m.replace(/^(?:const|let|var|function)\s+/, ""))
  );
  const missing = [...used].filter((name) => !defined.has(name));
  if (missing.length) {
    problems.push(
      "Undefined helper(s) in the emitted widget: " + missing.join(", ") +
      ".\n  A bundler injected these but they live outside the serialised function." +
      "\n  Add a shim for each in WIDGET_HTML (widget.js)."
    );
  }

  // Catches a serialisation that produced something that is not valid JS.
  try {
    new Function(src);
  } catch (e) {
    problems.push("The emitted widget does not parse: " + e.message);
  }

  if (!/id="mos-root"/.test(html)) problems.push("Missing the #mos-root mount point.");
  if (!/widgetMain|mos-root/.test(src)) problems.push("The widget body looks empty.");

  console.log(label + ": " + (html.length / 1024).toFixed(1) + " KiB, " +
    used.size + " bundler identifier(s), " + defined.size + " shimmed");

  if (problems.length) {
    console.error("\nFAIL\n- " + problems.join("\n- "));
    return false;
  }
  console.log("PASS");
  return true;
}

const target = process.argv[2];
const html = target ? await fetchDeployed(target) : WIDGET_HTML;
const ok = check(html, target ? "deployed (" + target + ")" : "local build");
process.exit(ok ? 0 : 1);

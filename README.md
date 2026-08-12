# Margin of Safety — ChatGPT app

The intrinsic-value worksheet as a ChatGPT app. Someone asks "what is Stripe actually worth?",
ChatGPT researches it with web search on **their own account**, and the dashboard renders inline in
the conversation — sliders, tape, ledger, full worksheet. No API key, no cost to you.

This is the OpenAI counterpart to the Claude artifact at `/margin-of-safety/`.

## How it works

Apps in ChatGPT are built on MCP: you host a server that declares tools and a UI resource, and
ChatGPT renders your HTML in an iframe in the conversation.

The important design decision is that **this server holds no API key and runs no inference.** The
tool's input schema *is* the worksheet. ChatGPT does the research and the valuation itself, then
calls the tool with a completed analysis; the server validates it, echoes it back, and serves the
widget that draws it. So there is nothing to drain, nothing to rate-limit, and hosting is free at
any plausible traffic level.

```
  user asks ──▶ ChatGPT researches (their account, their web search)
                     │
                     ├──▶ computes the five scenarios
                     │
                     └──▶ calls render_margin_of_safety_worksheet(worksheet)
                                │
                                ▼
                          this server  ── validates, echoes ──▶ widget iframe
                          (no key, no inference)                (draws + recomputes)
```

## Files

```
margin-of-safety/
├── schema.js         # the worksheet JSON Schema + tool description (the model's contract)
├── widget.js         # the dashboard: CSS, the widget function, and the HTML resource
├── server.js         # MCP over streamable HTTP; portable fetch handler
├── node-server.mjs   # Node adapter, for local testing
├── check.mjs         # pre-deploy guard: catches bundler-injected helpers
└── README.md
```

Deployed at **https://margin-of-safety.margin-of-safety.workers.dev/mcp**.

`widget.js` builds its HTML by serialising `widgetMain` with `Function.prototype.toString()`. That
keeps the widget as real, syntax-checked JavaScript instead of an escaped string blob — but it means
`widgetMain` must not reference anything outside its own body.

## Deploy

`server.js` is a standard fetch handler (`Request` in, `Response` out) with no dependencies and no
build step, so most hosts take it as-is.

**Cloudflare Workers**

```bash
npx wrangler deploy server.js --name margin-of-safety --compatibility-date 2026-01-01
```

**Deno Deploy**

```js
// main.js
import { handleRequest } from "./server.js";
Deno.serve(handleRequest);
```

**Vercel** — put `server.js` behind an edge function that forwards to `handleRequest`, or run the
Node adapter as a serverless function.

**Anywhere with Node**

```bash
node node-server.mjs 8788
```

Whatever you choose, the MCP endpoint is `POST <origin>/mcp`, and the origin must be public HTTPS.
A tunnel is fine for testing but not for a directory submission.

## Use it yourself, and share it with friends

No review, no approval — this works today on any paid individual plan:

1. In ChatGPT: **Settings → Connectors → Advanced → Developer mode**, turn it on.
2. **Settings → Apps** (or `chatgpt.com/plugins`) → **＋** → create an app pointing at
   `https://your-host/mcp`.
3. Ask: *"value Databricks with margin of safety"*.

Friends do the same two steps with your URL. Developer mode is available on Pro, Plus, Business,
Enterprise and Edu on the web. Workspace accounts differ: an admin enables it in workspace settings,
and cannot enable it per-member.

## Listing it publicly (optional)

Submitting to the ChatGPT App Directory needs a verified developer identity on the OpenAI platform,
a reachable production endpoint with domain verification, and review of the listing, CSP, tool
metadata, auth, and test cases. Review covers behaviour against OpenAI's app guidelines, and
submission does not guarantee listing. Developer mode is enough for a private circle; the directory
is for reaching strangers.

## Local testing

```bash
node node-server.mjs 8788

# handshake
curl -s -X POST localhost:8788/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}'

# the tool contract the model sees
curl -s -X POST localhost:8788/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# the widget HTML
curl -s -X POST localhost:8788/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"ui://widget/margin-of-safety.html"}}'
```

To exercise the widget without ChatGPT, take the `text` from `resources/read`, prepend a stub, and
open it in a browser:

```html
<script>window.openai = { toolInput: /* a worksheet object */, theme: "dark" };</script>
<!-- then the widget HTML -->
```

## Always check the deployed bundle, never the local build

```bash
node check.mjs                                    # the local build
node check.mjs https://your-host                  # what a deployment serves
```

Run the second one after every deploy. The widget is produced by serialising a function with
`Function.prototype.toString()`, which is only safe while that function references nothing outside
its own body — and a bundler can quietly break that rule. esbuild's `keepNames`, on by default in
wrangler, rewrites every inner function as `__name(fn, "fn")` and defines `__name` at module scope.
The serialised copy keeps the calls and loses the helper, so the widget dies on load with
`ReferenceError: __name is not defined`.

Node does not bundle, so the local build renders fine and the deployed one does not. `check.mjs`
compares the identifiers the emitted script uses against the ones it defines, and `WIDGET_HTML`
ships shims for the helpers so the output no longer depends on how it was built.

## Two requirements that are easy to get wrong

Both of these present as **"Error loading app — Runtime error"** in ChatGPT, with no detail:

1. **`mimeType` must be exactly `text/html;profile=mcp-app`.** An older, ChatGPT-specific type
   (`text/html+skybridge`) appears in some reference material and is not recognised. The host does
   not treat an unknown type as an error at connect time — the app registers fine, the tool runs,
   and only the render fails.
2. **The resource URI is the cache key.** ChatGPT caches the component per `ui://` URI, so editing
   the widget without bumping the URI can leave a stale copy in place. Hence `worksheet-v2.html`;
   bump it on any change to the widget's shape.

The widget also installs an `error` and `unhandledrejection` handler and renders whatever it catches
into its own frame. A widget that throws otherwise shows only ChatGPT's generic runtime error, with
the real exception stranded in a sandboxed iframe console.

## Units are percentage points, everywhere

`K`, `g`, `margin` and `prob` are all percentage points, never fractions: `11` for 11%, not `0.11`.
This is not pedantry. A `K` of `0.08` meaning 8% divides by `0.0008` and yields a valuation in the
tens of trillions — an answer that looks plausible enough to publish. The schema constrains the
ranges (`K` 1–30, `g` −10–10) and the server rejects out-of-band values with a message naming the
correct form, so the model can retry rather than silently produce nonsense.

## Disclaimers

Everything the app produces is a model-generated estimate built from public reporting at run time.
Numbers can be wrong, stale, or hallucinated; verify against primary sources. Nothing here is
investment advice.

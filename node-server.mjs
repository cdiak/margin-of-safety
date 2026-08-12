/* ============================================================
   Node adapter — for local testing, and for hosts that want a
   plain HTTP server. Cloudflare Workers, Deno Deploy and Vercel
   Edge do not need this file; they import server.js directly.

   Usage:  node node-server.mjs [port]
   ============================================================ */

import { createServer } from "node:http";
import { handleRequest } from "./server.js";

const port = Number(process.argv[2] || process.env.PORT || 8788);

createServer(async (req, res) => {
  const url = "http://" + (req.headers.host || "localhost:" + port) + req.url;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });

  let response;
  try {
    response = await handleRequest(request);
  } catch (e) {
    response = new Response("Internal error: " + e.message, { status: 500 });
  }

  res.writeHead(response.status, Object.fromEntries(response.headers));
  const text = await response.arrayBuffer();
  res.end(Buffer.from(text));
}).listen(port, () => {
  console.log("Margin of Safety MCP server on http://localhost:" + port + "/mcp");
});

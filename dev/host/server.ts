// Dev MCP Apps host: renders the ForgeGraph ui:// views the way T3 Code will,
// against any ForgeGraph MCP server.
//
//   MCP_URL=http://127.0.0.1:8788/mcp APP_ID=<app id> bun dev/host/server.ts
//   MCP_URL=https://forgegraf.com/api/mcp MCP_TOKEN=<oauth access token> APP_ID=... bun dev/host/server.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createHostBackend, type HostRequest } from "../../src/host/backend.ts";

const mcpUrl = process.env.MCP_URL ?? "http://127.0.0.1:8788/mcp";
const port = Number(process.env.PORT ?? 8790);
const client = new Client({ name: "forgegraph-dev-host", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), {
  requestInit: process.env.MCP_TOKEN ? { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } } : {},
}));
const handle = createHostBackend(client);

const build = await Bun.build({ entrypoints: [new URL("./client.ts", import.meta.url).pathname], target: "browser", minify: true });
if (!build.success) throw new AggregateError(build.logs, "dev host client build failed");
const clientJs = await build.outputs[0]!.text();
const indexHtml = await Bun.file(new URL("./index.html", import.meta.url)).text();

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/") return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (pathname === "/client.js") return new Response(clientJs, { headers: { "content-type": "text/javascript" } });
    if (pathname === "/api/config") return Response.json({ server: mcpUrl, appId: process.env.APP_ID });
    if (pathname === "/api/host" && request.method === "POST") {
      try {
        return Response.json(await handle((await request.json()) as HostRequest));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`dev MCP Apps host on http://127.0.0.1:${port} → ${mcpUrl}`);

import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import manifest from "../t3-plugin.json" with { type: "json" };
import { toolCallableByApp, toolResourceUri } from "./host/backend.ts";
import { validateManifestV2 } from "./manifest.ts";

describe("v2 manifest", () => {
  it("matches the shape T3 installs", () => {
    expect(validateManifestV2(manifest)).toEqual([]);
  });

  it("reaches the hosted server over OAuth, with no stored token and no T3 callbacks", () => {
    expect(manifest.mcpServer.transport).toEqual({ type: "http", url: "https://forgegraf.com/api/mcp", headers: [], auth: { type: "oauth", scopes: ["forgegraph:read"] } });
    expect(manifest.t3Tools).toEqual([]);
  });

  it("rejects v1 fields and dangling commands", () => {
    expect(validateManifestV2({ ...manifest, runtime: { kind: "managed-app" } })).toContain("runtime is a v1 field");
    expect(validateManifestV2({ ...manifest, contributes: { ...manifest.contributes, commands: [{ id: "x", title: "X", panel: "nope" }] } })).toContain("x: unknown panel nope");
    expect(validateManifestV2({ ...manifest, mcpServer: { ...manifest.mcpServer, name: "t3-code" } })).toContain("mcpServer.name must be a Tools server name");
    const dotted = { ...manifest.contributes.panels[0]!, id: "forgegraph.overview" };
    expect(validateManifestV2({ ...manifest, contributes: { panels: [dotted], commands: [] } })[0]).toStartWith("forgegraph.overview: panel id must match");
  });
});

// Opt-in: FORGEGRAPH_MCP_URL=http://127.0.0.1:8788/mcp (dev server) or the
// hosted URL with FORGEGRAPH_MCP_TOKEN=<OAuth access token>.
const liveUrl = process.env.FORGEGRAPH_MCP_URL;
describe.skipIf(!liveUrl)("manifest against a live ForgeGraph MCP server", () => {
  it("serves every panel's view, and every tool is app-callable", async () => {
    const client = new Client({ name: "forgegraph-plugin-test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(liveUrl!), {
      requestInit: process.env.FORGEGRAPH_MCP_TOKEN ? { headers: { Authorization: `Bearer ${process.env.FORGEGRAPH_MCP_TOKEN}` } } : {},
    }));
    try {
      const { resources } = await client.listResources();
      const { tools } = await client.listTools();
      for (const panel of manifest.contributes.panels) {
        expect(resources.find((r) => r.uri === panel.resourceUri)?.mimeType).toBe("text/html;profile=mcp-app");
        expect(tools.some((t) => toolResourceUri(t) === panel.resourceUri)).toBe(true);
      }
      expect(tools.filter((t) => !toolCallableByApp(t)).map((t) => t.name)).toEqual([]);
    } finally {
      await client.close();
    }
  });
});

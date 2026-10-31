import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHostBackend, MCP_APP_MIME_TYPE, toolCallableByApp } from "./backend.ts";

async function connect() {
  const server = new McpServer({ name: "fake", version: "0" });
  const ok = async () => ({ content: [{ type: "text" as const, text: "{}" }], structuredContent: { ok: true } });
  server.registerTool("view_tool", { _meta: { ui: { visibility: ["model", "app"], resourceUri: "ui://fake/view" } } }, ok);
  server.registerTool("model_only", { _meta: { ui: { visibility: ["model"] } } }, ok);
  server.registerTool("unmarked", {}, ok);
  server.registerResource("view", "ui://fake/view", { mimeType: MCP_APP_MIME_TYPE }, async () => ({ contents: [{ uri: "ui://fake/view", mimeType: MCP_APP_MIME_TYPE, text: "<!doctype html>", _meta: { ui: { prefersBorder: true } } }] }));
  server.registerResource("plain", "ui://fake/plain", { mimeType: "text/html" }, async () => ({ contents: [{ uri: "ui://fake/plain", mimeType: "text/html", text: "<p>" }] }));
  const client = new Client({ name: "host", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("dev MCP Apps host backend", () => {
  it("follows the approved visibility rule: views need an explicit \"app\"", async () => {
    const handle = createHostBackend(await connect());
    await expect(handle({ method: "tools/call", name: "view_tool", from: "app" })).resolves.toMatchObject({ structuredContent: { ok: true } });
    await expect(handle({ method: "tools/call", name: "model_only", from: "app" })).rejects.toThrow("not callable by apps");
    await expect(handle({ method: "tools/call", name: "unmarked", from: "app" })).rejects.toThrow("not callable by apps");
    // The host itself (an agent's tool call) may call any tool.
    await expect(handle({ method: "tools/call", name: "model_only", from: "host" })).resolves.toBeDefined();
    // Today's T3 rule (mcpAppToolCallableByApp) allows unmarked tools.
    expect(toolCallableByApp({ _meta: {} }, false)).toBe(true);
  });

  it("serves only ui:// MCP App resources", async () => {
    const handle = createHostBackend(await connect());
    await expect(handle({ method: "resources/read", uri: "ui://fake/view" })).resolves.toEqual({ html: "<!doctype html>", meta: { ui: { prefersBorder: true } } });
    await expect(handle({ method: "resources/read", uri: "ui://fake/plain" })).rejects.toThrow("not an MCP App view");
    await expect(handle({ method: "resources/read", uri: "https://example.com/x" })).rejects.toThrow("Only ui://");
  });
});

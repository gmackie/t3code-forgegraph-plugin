import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult, ReadResourceResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export type HostRequest =
  | { readonly method: "tools/list" }
  | { readonly method: "tools/call"; readonly name: string; readonly arguments?: Record<string, unknown>; readonly from: "host" | "app" }
  | { readonly method: "resources/read"; readonly uri: string };

/**
 * T3's approved plugin design: a view may call a tool only when the tool's
 * `_meta.ui.visibility` includes "app". `strict: false` is today's
 * mcpAppToolCallableByApp, which also allows tools with no visibility.
 */
export function toolCallableByApp(tool: Pick<Tool, "_meta">, strict = true): boolean {
  const visibility = (tool._meta?.ui as { visibility?: unknown } | undefined)?.visibility;
  return Array.isArray(visibility) ? visibility.includes("app") : !strict;
}

export function toolResourceUri(tool: Pick<Tool, "_meta">): string | undefined {
  const uri = (tool._meta?.ui as { resourceUri?: unknown } | undefined)?.resourceUri;
  return typeof uri === "string" && uri.startsWith("ui://") ? uri : undefined;
}

/**
 * Server half of a minimal MCP Apps host, shaped like T3's McpAppRequests:
 * the view only reaches the one MCP server that served it, hidden tools are
 * refused server-side, and only ui:// MCP App resources are served.
 */
export function createHostBackend(client: Pick<Client, "listTools" | "callTool" | "readResource">, options: { readonly strictVisibility?: boolean } = {}) {
  let tools: Promise<Tool[]> | undefined;
  const listTools = () => (tools ??= client.listTools().then((r) => r.tools));
  return async function handle(request: HostRequest): Promise<unknown> {
    if (request.method === "tools/list") return { tools: await listTools() };
    if (request.method === "tools/call") {
      const tool = (await listTools()).find((t) => t.name === request.name);
      if (!tool) throw new Error(`Unknown tool: ${request.name}`);
      if (request.from === "app" && !toolCallableByApp(tool, options.strictVisibility ?? true)) throw new Error(`Tool is not callable by apps: ${request.name}`);
      return (await client.callTool({ name: request.name, arguments: request.arguments ?? {} })) as CallToolResult;
    }
    if (!request.uri.startsWith("ui://")) throw new Error("Only ui:// resources can be rendered");
    const result = (await client.readResource({ uri: request.uri })) as ReadResourceResult;
    const content = result.contents[0];
    if (!content || content.mimeType !== MCP_APP_MIME_TYPE || !("text" in content)) throw new Error("Resource is not an MCP App view");
    return { html: content.text, meta: content._meta ?? {} };
  };
}

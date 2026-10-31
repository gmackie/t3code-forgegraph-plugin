// Browser half of the dev MCP Apps host. Uses the official AppBridge from
// @modelcontextprotocol/ext-apps, speaking protocol 2026-01-26 like T3's
// McpAppFrame. Views are sandboxed srcdoc iframes without same-origin access.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

type Mount = {
  readonly title: string;
  readonly tool: string;
  /** "tool": an agent called the tool (thread). "panel": thread-less T3CODE-74 panel, no tool result. */
  readonly mode: "tool" | "panel";
  readonly args?: Record<string, unknown>;
};

const themes = {
  light: { "--color-background-primary": "#ffffff", "--color-background-secondary": "#f4f5f7", "--color-text-primary": "#1f2328", "--color-text-secondary": "#656d76", "--color-border-primary": "#d8dee4" },
  dark: { "--color-background-primary": "#16181d", "--color-background-secondary": "#1f2229", "--color-text-primary": "#e6edf3", "--color-text-secondary": "#8d96a0", "--color-border-primary": "#30363d" },
} as const;
let theme: keyof typeof themes = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const bridges: AppBridge[] = [];
const log = document.getElementById("log")!;

async function host<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/host", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error);
  return json as T;
}
function note(text: string) {
  log.textContent = `${new Date().toLocaleTimeString()}  ${text}\n${log.textContent}`.slice(0, 4000);
}
function hostContext() {
  return { theme, displayMode: "inline" as const, availableDisplayModes: ["inline" as const], platform: "web" as const, styles: { variables: themes[theme] } };
}

async function mount(container: HTMLElement, spec: Mount, tools: Tool[]) {
  const tool = tools.find((t) => t.name === spec.tool);
  const uri = (tool?._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
  if (!uri) throw new Error(`${spec.tool} has no ui:// view`);
  const { html } = await host<{ html: string }>({ method: "resources/read", uri });
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `<h3></h3><p class="sub"></p>`;
  card.querySelector("h3")!.textContent = spec.title;
  card.querySelector(".sub")!.textContent = `${spec.mode === "tool" ? "tool call" : "thread-less panel"} · ${spec.tool} · ${uri}`;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts allow-forms");
  iframe.srcdoc = html;
  card.append(iframe);
  container.append(card);

  const bridge = new AppBridge(null, { name: "forgegraph-dev-host", version: "0.1.0" }, { serverTools: {}, openLinks: {}, logging: {} }, { hostContext: hostContext() });
  bridges.push(bridge);
  bridge.oncalltool = async (params) => {
    note(`view → tools/call ${params.name} ${JSON.stringify(params.arguments ?? {})}`);
    return host<CallToolResult>({ method: "tools/call", name: params.name, arguments: params.arguments, from: "app" });
  };
  bridge.onsizechange = ({ height }) => { if (height) iframe.style.height = `${Math.min(height, 2000)}px`; };
  bridge.onopenlink = async ({ url }) => { window.open(url, "_blank", "noopener"); return {}; };
  bridge.oninitialized = async () => {
    note(`${spec.title}: view initialized`);
    if (spec.mode !== "tool") return;
    await bridge.sendToolInput({ arguments: spec.args ?? {} });
    const result = await host<CallToolResult>({ method: "tools/call", name: spec.tool, arguments: spec.args, from: "host" });
    await bridge.sendToolResult(result);
  };
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
}

async function main() {
  const config = await (await fetch("/api/config")).json() as { appId?: string; server: string };
  document.getElementById("server")!.textContent = config.server;
  const { tools } = await host<{ tools: Tool[] }>({ method: "tools/list" });
  const views = document.getElementById("views")!;
  if (!config.appId) {
    await mount(views, { title: "Changes (panel)", tool: "list_app_changes", mode: "panel" }, tools);
    return;
  }
  const changes = await host<CallToolResult>({ method: "tools/call", name: "list_app_changes", arguments: { appId: config.appId }, from: "host" });
  const items = (changes.structuredContent as { items: { id: string; check: { status: string; current: boolean } }[] }).items;
  const failing = items.find((c) => c.check.status === "failed") ?? items[0];
  await mount(views, { title: "Delivery overview", tool: "get_delivery_overview", mode: "tool", args: { appId: config.appId } }, tools);
  await mount(views, { title: "Changes", tool: "list_app_changes", mode: "tool", args: { appId: config.appId } }, tools);
  if (failing) await mount(views, { title: "Checks", tool: "get_changeset_checks", mode: "tool", args: { changesetId: failing.id } }, tools);
  await mount(views, { title: "Changes as a project panel (no thread, no tool result)", tool: "list_app_changes", mode: "panel" }, tools);
}

document.getElementById("theme")!.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  for (const bridge of bridges) void bridge.sendHostContextChange(hostContext());
});
document.documentElement.dataset.theme = theme;
main().catch((error) => note(`error: ${error instanceof Error ? error.message : String(error)}`));

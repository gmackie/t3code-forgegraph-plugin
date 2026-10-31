/**
 * Draft T3 plugin manifest v2, as approved on T3CODE-74 (2026-10-31) plus
 * T3CODE-80's `transport.auth`. `mcpServer` mirrors Settings → Tools'
 * McpServerConfig / McpServerVariable (packages/contracts/src/agentTools.ts).
 * T3 owns the real schema; this checks our draft against the agreed shape.
 */
export type McpServerVariable = { readonly name: string; readonly value?: string; readonly sensitive?: boolean; readonly title?: string };
export type McpServerTransport =
  | { readonly type: "stdio"; readonly command: string; readonly args?: readonly string[]; readonly env?: readonly McpServerVariable[] }
  | {
      readonly type: "http";
      readonly url: string;
      readonly headers?: readonly McpServerVariable[];
      /** T3CODE-80: T3 runs discovery, registration, PKCE and refresh. */
      readonly auth?: { readonly type: "oauth"; readonly scopes: readonly string[] };
    };
export type PluginManifestV2 = {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly mcpServer: { readonly name: string; readonly transport: McpServerTransport; readonly variables?: readonly McpServerVariable[] };
  readonly contributes: {
    readonly panels: readonly { readonly id: string; readonly title: string; readonly scope: "thread" | "project"; readonly resourceUri: string }[];
    readonly commands?: readonly { readonly id: string; readonly title: string; readonly panel: string }[];
  };
  readonly t3Tools: readonly string[];
};

const SERVER_NAME = /^[a-z][a-z0-9_-]{0,47}$/;
const LEGACY_KEYS = ["runtime", "capabilities", "settings", "settingsPanels", "workflows", "hooks", "navigation"];

/** Returns problems with a draft v2 manifest; empty means it matches the agreed shape. */
export function validateManifestV2(input: unknown): string[] {
  const problems: string[] = [];
  const m = input as PluginManifestV2 & Record<string, unknown>;
  if (m?.schemaVersion !== 2) problems.push("schemaVersion must be 2");
  for (const key of ["id", "displayName", "version"] as const) if (typeof m?.[key] !== "string" || !m[key]) problems.push(`${key} is required`);
  for (const key of LEGACY_KEYS) if (key in (m ?? {}) || key in (m?.contributes ?? {})) problems.push(`${key} is a v1 field`);
  const server = m?.mcpServer;
  if (!server || !SERVER_NAME.test(server.name ?? "") || server.name === "t3-code") problems.push("mcpServer.name must be a Tools server name");
  const transport = server?.transport;
  if (transport?.type === "http") {
    if (!/^https:\/\//.test(transport.url)) problems.push("http transport needs an https url");
    if (transport.auth && (transport.auth.type !== "oauth" || !transport.auth.scopes?.length)) problems.push("auth must be oauth with scopes");
  } else if (transport?.type === "stdio") {
    if (!transport.command) problems.push("stdio transport needs a command");
  } else problems.push("mcpServer.transport must be stdio or http");
  const variables = [...(server?.variables ?? []), ...(transport?.type === "http" ? transport.headers ?? [] : transport?.env ?? [])];
  for (const v of variables) if (!v.name) problems.push("variables need a name");
  const panels = m?.contributes?.panels ?? [];
  if (!panels.length) problems.push("contributes.panels is empty");
  const panelIds = new Set<string>();
  for (const panel of panels) {
    if (panelIds.has(panel.id)) problems.push(`duplicate panel ${panel.id}`);
    panelIds.add(panel.id);
    if (panel.scope !== "thread" && panel.scope !== "project") problems.push(`${panel.id}: scope must be thread or project`);
    if (!panel.resourceUri?.startsWith("ui://")) problems.push(`${panel.id}: resourceUri must be ui://`);
  }
  for (const command of m?.contributes?.commands ?? []) if (!panelIds.has(command.panel)) problems.push(`${command.id}: unknown panel ${command.panel}`);
  if (!Array.isArray(m?.t3Tools) || m.t3Tools.some((t) => typeof t !== "string")) problems.push("t3Tools must list tool names");
  return problems;
}

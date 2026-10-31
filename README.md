# T3 Code ForgeGraph plugin

ForgeGraph delivery tracking for T3 Code.

## MCP-native (v2, draft): T3CODE-79

The plugin is the manifest `t3-plugin.v2.json` plus ForgeGraph's **hosted** MCP
server, `https://forgegraf.com/api/mcp`. It has no local process:

- **Tools:** agents get ForgeGraph's read-only tools in every session through
  Settings → Tools. The view tools are `get_delivery_overview`,
  `list_app_changes` and `get_changeset_checks`.
- **UI:** the MCP Apps views `ui://forgegraph/overview`, `/changes` and
  `/checks` are served by the same server (ForgeGraph FORGE-282). A view
  reaches ForgeGraph only through the host bridge (`tools/call`), so it needs
  no token, network access or CSP domains.
- **Auth:** OAuth (`forgegraph:read`). T3 does discovery, registration, PKCE
  and refresh (T3CODE-80). No token is stored in the manifest.
- **Panels:** the three views are `project` panels. Opened without a tool
  result, a view asks for a workspace and app.

`t3-plugin.json` and `src/{stdio,rpc,forgegraph}.ts` are the v1 managed-app
plugin. They stay until T3's hard cutover (T3CODE-74 P6).

### Dev MCP Apps host

`dev/host` renders the views the way T3 will. It uses the official `AppBridge`
from `@modelcontextprotocol/ext-apps` 1.7.5 (protocol `2026-01-26`, the same as
T3's McpAppFrame). It follows T3's server-side rules: a view may only call its
own server's tools, only tools whose visibility includes `"app"`, and only
`ui://` `text/html;profile=mcp-app` resources are served.

```sh
bun install
# against any ForgeGraph MCP server (local dev server or hosted + OAuth access token)
MCP_URL=http://127.0.0.1:8788/mcp APP_ID=<app id> bun run dev:host   # http://127.0.0.1:8790
MCP_URL=https://forgegraf.com/api/mcp MCP_TOKEN=<access token> APP_ID=<app id> bun run dev:host
```

### Tests

```sh
bun test                                                     # manifest + host backend
FORGEGRAPH_MCP_URL=http://127.0.0.1:8788/mcp bun test        # + live check of every panel's view
```

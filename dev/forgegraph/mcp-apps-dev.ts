// Copy into a ForgeGraph checkout as apps/web/.tmp/mcp-apps-dev.ts (gitignored) and run there:
//   DATABASE_URL=<disposable Postgres with the schema> OTEL_DISABLED=true bun .tmp/mcp-apps-dev.ts
// Dev-only: serve ForgeGraph's MCP server (with the ui:// views) over
// Streamable HTTP on localhost, bound to a seeded demo user. No OAuth.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createDb } from "@forgegraph/db";
import { deployments } from "@forgegraph/db/schema";
import { createTestApp, createTestBuild, createTestChangeset, createTestRepo, createTestStage, createTestUser, createTestWorkspace } from "../../../packages/api/src/__tests__/helpers/fixtures";
import { createMcpServer } from "../src/lib/mcp/tools";

const db = createDb(process.env.DATABASE_URL!, { maxConnections: 4 });
const user = await createTestUser(db, { username: "demo" });
const { workspace } = await createTestWorkspace(db, user.id, { name: "gmacko" } as never);
const repo = await createTestRepo(db, { workspaceId: workspace.id, name: "t3code" } as never);
const app = await createTestApp(db, { workspaceId: workspace.id, ownerId: user.id, repositoryId: repo.id, name: "t3code-web", slug: "t3code-web" } as never);
const sha = (c: string) => c.repeat(40);
const minutes = (n: number) => new Date(Date.now() - n * 60_000);
const prs = [
  { title: "T3CODE-74: MCP-native plugin host", status: "open", headSha: sha("a"), builds: [["passed", sha("a")]] },
  { title: "T3CODE-73: Settings → Tools registry", status: "approved", headSha: sha("b"), builds: [["failed", sha("b")], ["passed", sha("9")]] },
  { title: "Mobile: McpAppWebView sizing", status: "open", headSha: sha("c"), builds: [["passed", sha("8")]] },
  { title: "Draft: thread-less plugin panels", status: "draft", headSha: sha("d"), builds: [["running", sha("d")]] },
  { title: "Fix composer review layout", status: "merged", headSha: sha("e"), builds: [["passed", sha("e")]] },
] as const;
let n = 100;
for (const pr of prs) {
  const cs = await createTestChangeset(db, repo.id, { title: pr.title, status: pr.status as never, headSha: pr.headSha, sourceBranch: pr.title.split(":")[0]!.toLowerCase().replace(/\W+/g, "-") });
  for (const [status, commitSha] of [...pr.builds].reverse()) await createTestBuild(db, cs.id, { status: status as never, commitSha, pipelineName: "ci", durationMs: 92_000 });
  n++;
}
const staging = await createTestStage(db, app.id, { name: "staging" });
const production = await createTestStage(db, app.id, { name: "production" });
await db.insert(deployments).values([
  { appId: app.id, stageId: production.id, status: "active", commitSha: sha("e"), createdAt: minutes(300), deployedAt: minutes(298) },
  { appId: app.id, stageId: staging.id, status: "active", commitSha: sha("e"), createdAt: minutes(120), deployedAt: minutes(118) },
  { appId: app.id, stageId: staging.id, status: "failed", commitSha: sha("b"), createdAt: minutes(12) },
]);
const sessionUser = { id: user.id, username: user.username!, email: user.email, displayName: null, avatarUrl: null, isAdmin: false, tokenScope: "read" as const };
const port = Number(process.env.PORT ?? 8788);
Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/mcp") return new Response("not found", { status: 404 });
    const server = createMcpServer(db, sessionUser);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try { return await transport.handleRequest(request); } finally { await server.close(); }
  },
});
console.log(JSON.stringify({ url: `http://127.0.0.1:${port}/mcp`, appId: app.id }));

import { createForgeGraphClient, type DeliverySnapshot } from "./forgegraph.ts";
import { createRpcHandler } from "./rpc.ts";

let snapshot = JSON.parse(process.env.T3_PLUGIN_SNAPSHOT ?? '{"status":{"stages":[],"deployments":[]},"pullRequests":[],"deployments":[]}') as DeliverySnapshot;
const commandPrefix = process.env.T3_PLUGIN_COMMAND?.trim().split(/\s+/u).filter(Boolean) ?? [];
const client = commandPrefix.length > 0
  ? createForgeGraphClient(async (args) => {
      const process = Bun.spawn([...commandPrefix, ...args], { stdout: "pipe", stderr: "ignore" });
      const output = await new Response(process.stdout).text();
      await process.exited;
      return output;
    })
  : null;
const refresh = async () => {
  if (client) {
    const stage = process.env.T3_PLUGIN_STAGE ?? "staging";
    const [status, pullRequests, deployments] = await Promise.all([client.status(), client.listPullRequests(), client.listDeployments(stage)]);
    snapshot = { status, pullRequests, deployments };
  }
  return snapshot;
};
const handler = createRpcHandler({ get snapshot() { return snapshot; }, refresh });
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { requestId: string; method: string; payload?: { navigationId?: string; workflowId?: string } };
      void handler(request.method, request.payload).then((result: unknown) => process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: request.requestId, ...(result as object) })}\n`));
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: "unknown", ok: false, error: error instanceof Error ? error.message : "invalid request" })}\n`);
    }
  }
});

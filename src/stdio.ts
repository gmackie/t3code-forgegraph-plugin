import { createForgeGraphClient, type DeliverySnapshot } from "./forgegraph.ts";
import { createRpcHandler } from "./rpc.ts";

let snapshot = JSON.parse(process.env.T3_PLUGIN_SNAPSHOT ?? '{"status":{"stages":[],"deployments":[]},"pullRequests":[],"deployments":[]}') as DeliverySnapshot;
const statePath = process.env.T3_PLUGIN_STATE_FILE;
let workflowState = { approved: false, executionRequested: false };
if (statePath) {
  try {
    const stored = JSON.parse(await Bun.file(statePath).text()) as { workflowState?: { approved?: boolean; executionRequested?: boolean } };
    workflowState.approved = stored.workflowState?.approved === true;
    workflowState.executionRequested = stored.workflowState?.executionRequested === true;
  } catch {
    // A missing or invalid state file starts from the safe unapproved state.
  }
}
const commandPrefix = process.env.T3_PLUGIN_COMMAND?.trim().split(/\s+/u).filter(Boolean) ?? [];
const executePrefix = process.env.T3_PLUGIN_EXECUTE_COMMAND?.trim().split(/\s+/u).filter(Boolean) ?? [];
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
const handler = createRpcHandler({ get snapshot() { return snapshot; }, refresh, workflowState, executeDelivery: async (input) => {
  if (!client || executePrefix.length === 0) return {};
  const output = await client.execute([...executePrefix, ...(input.stage ? ["--stage", input.stage] : [])]);
  return { reference: output.trim() || undefined };
}, saveWorkflowState: async () => {
  if (statePath) await Bun.write(statePath, JSON.stringify({ workflowState }));
} });
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { requestId: string; method: string; payload?: { navigationId?: string; workflowId?: string; actionId?: string; input?: unknown } };
      void handler(request.method, request.payload).then((result: unknown) => process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: request.requestId, ...(result as object) })}\n`));
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: "unknown", ok: false, error: error instanceof Error ? error.message : "invalid request" })}\n`);
    }
  }
});

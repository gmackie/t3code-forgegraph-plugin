import { createRpcHandler } from "./rpc.ts";
import type { DeliverySnapshot } from "./forgegraph.ts";

const snapshot = JSON.parse(process.env.T3_PLUGIN_SNAPSHOT ?? '{"status":{"stages":[],"deployments":[]},"pullRequests":[],"deployments":[]}') as DeliverySnapshot;
const handler = createRpcHandler({ snapshot, refresh: async () => snapshot });
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { requestId: string; method: string; payload?: { navigationId?: string } };
      void handler(request.method, request.payload).then((result) => process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: request.requestId, ...result })}\n`));
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: "unknown", ok: false, error: error instanceof Error ? error.message : "invalid request" })}\n`);
    }
  }
});

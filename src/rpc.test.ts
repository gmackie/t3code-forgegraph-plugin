import { describe, expect, it } from "bun:test";
import { createRpcHandler } from "./rpc.ts";

describe("ForgeGraph RPC", () => {
  it("serves delivery cards from the cached graph snapshot", async () => {
    const handler = createRpcHandler({ snapshot: { status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }, refresh: async () => ({ status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }) });
    await expect(handler("surface.get", { navigationId: "forgegraph.deployments" })).resolves.toMatchObject({ ok: true, result: { pluginId: "com.t3code.forgegraph", navigationId: "forgegraph.deployments" } });
  });

  it("serves the canonical delivery review workflow", async () => {
    const handler = createRpcHandler({ snapshot: { status: { stages: [], deployments: [] }, pullRequests: [{ id: "pr-1", title: "Ship", state: "open", checks: "passing" }], deployments: [] }, refresh: async () => ({ status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }) });
    await expect(handler("workflow.get", { workflowId: "forgegraph.delivery-review" })).resolves.toMatchObject({ ok: true, result: { workflowId: "forgegraph.delivery-review", currentStage: "review" } });
  });
});

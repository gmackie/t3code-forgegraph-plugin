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

  it("persists approval actions in the workflow coordinator", async () => {
    let saved = false;
    const handler = createRpcHandler({ snapshot: { status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }, refresh: async () => ({ status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }), workflowState: { approved: false }, saveWorkflowState: async () => { saved = true; } });
    await expect(handler("action.execute", { actionId: "approve", input: { workflowId: "forgegraph.delivery-review" } })).resolves.toMatchObject({ ok: true, result: { status: "accepted" } });
    expect(saved).toBe(true);
    await expect(handler("workflow.get", { workflowId: "forgegraph.delivery-review" })).resolves.toMatchObject({ result: { currentStage: "execute" } });
  });

  it("executes an approved delivery action through the plugin callback", async () => {
    let executed = false;
    let saved = false;
    const handler = createRpcHandler({
      snapshot: { status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] },
      refresh: async () => ({ status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }),
      workflowState: { approved: true, executionRequested: false },
      saveWorkflowState: async () => { saved = true; },
      executeDelivery: async (input) => { executed = input.stage === "staging"; return { reference: "deploy-1" }; },
    });
    await expect(handler("action.execute", { actionId: "execute", input: { workflowId: "forgegraph.delivery-review", stage: "staging" } })).resolves.toMatchObject({ ok: true, result: { status: "accepted" } });
    expect(executed).toBe(true);
    expect(saved).toBe(true);
    await expect(handler("workflow.get", { workflowId: "forgegraph.delivery-review" })).resolves.toMatchObject({ result: { currentStage: "verify" } });
  });
});

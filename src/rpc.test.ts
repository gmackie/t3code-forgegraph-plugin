import { describe, expect, it } from "bun:test";
import { createRpcHandler } from "./rpc.ts";

describe("ForgeGraph RPC", () => {
  it("serves delivery cards from the cached graph snapshot", async () => {
    const handler = createRpcHandler({ snapshot: { status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }, refresh: async () => ({ status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }) });
    await expect(handler("surface.get", { navigationId: "forgegraph.deployments" })).resolves.toMatchObject({ ok: true, result: { pluginId: "com.t3code.forgegraph", navigationId: "forgegraph.deployments" } });
  });
});

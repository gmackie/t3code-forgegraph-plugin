import { describe, expect, it } from "bun:test";
import { DeliveryPollingCoordinator } from "./forgegraph.ts";
import { createForgeGraphRpcHandler } from "./rpc.ts";

describe("ForgeGraph status RPC", () => {
  it("refreshes on demand and serves the cached snapshot afterward", async () => {
    let loads = 0;
    const coordinator = new DeliveryPollingCoordinator({
      intervalSeconds: 60,
      load: async () => {
        loads += 1;
        return {
          status: { app: "t3code", stages: ["staging"], deployments: [] },
          pullRequests: [],
          deployments: [],
        };
      },
      onSnapshot: () => undefined,
    });
    const handler = createForgeGraphRpcHandler(coordinator);
    await expect(handler({ method: "delivery.status" })).resolves.toMatchObject({ ok: true });
    await expect(handler({ method: "delivery.status" })).resolves.toMatchObject({ ok: true });
    expect(loads).toBe(1);
  });
});

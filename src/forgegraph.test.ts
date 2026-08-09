import { describe, expect, it } from "bun:test";
import { buildCockpitViewModel, createForgeGraphClient, DeliveryPollingCoordinator, normalizePollingSeconds, summarizeDelivery } from "./forgegraph.ts";

describe("ForgeGraph delivery client", () => {
  it("builds delivery cockpit navigation and blocker metrics", () => {
    expect(buildCockpitViewModel({ openPullRequests: 2, failingChecks: 1, activeDeployments: 1, failedDeployments: 0 })).toEqual({
      navigation: ["overview", "changes", "checks", "deployments", "environments", "releases"],
      metrics: { openPullRequests: 2, failingChecks: 1, activeDeployments: 1, failedDeployments: 0 },
    });
  });
  it("uses the documented CLI commands and parses delivery records", async () => {
    const calls: readonly string[][] = [];
    const client = createForgeGraphClient(async (args) => {
      (calls as string[][]).push([...args]);
      if (args[0] === "pr") return JSON.stringify([{ id: "pr-1", title: "Ship", state: "open", checks: "passing" }]);
      if (args[0] === "deploy") return JSON.stringify([{ id: "dep-1", stage: "staging", status: "active" }]);
      return JSON.stringify({ app: "t3code", stages: ["staging"], deployments: [] });
    });
    await expect(client.listPullRequests()).resolves.toHaveLength(1);
    await expect(client.listDeployments("staging")).resolves.toMatchObject([{ id: "dep-1" }]);
    await expect(client.status()).resolves.toMatchObject({ app: "t3code" });
    expect(calls).toEqual([["pr", "list", "--json"], ["deploy", "history", "--stage", "staging", "--json"], ["status", "--json"]]);
  });

  it("summarizes PR and deployment risk without mutating delivery state", () => {
    expect(summarizeDelivery({
      pullRequests: [
        { id: "1", title: "A", state: "open", checks: "failing" },
        { id: "2", title: "B", state: "merged", checks: "passing" },
      ],
      deployments: [
        { id: "d1", stage: "staging", status: "deploying" },
        { id: "d2", stage: "production", status: "failed" },
      ],
    })).toEqual({ openPullRequests: 1, failingChecks: 1, activeDeployments: 1, failedDeployments: 1 });
  });

  it("bounds refresh intervals and publishes each loaded snapshot", async () => {
    expect(normalizePollingSeconds(1)).toBe(15);
    expect(normalizePollingSeconds(99999)).toBe(3600);
    const snapshots: unknown[] = [];
    const coordinator = new DeliveryPollingCoordinator({
      intervalSeconds: 1,
      load: async () => ({ status: { stages: [], deployments: [] }, pullRequests: [], deployments: [] }),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    await coordinator.refresh();
    expect(coordinator.intervalSeconds).toBe(15);
    expect(snapshots).toHaveLength(1);
  });
});

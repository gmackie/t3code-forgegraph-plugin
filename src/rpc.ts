import { buildSurfaceModel, type DeliverySnapshot } from "./forgegraph.ts";

export function createRpcHandler(coordinator: {
  snapshot: DeliverySnapshot | null;
  refresh(): Promise<DeliverySnapshot>;
}) {
  return async (method: string, payload?: { navigationId?: string; panelId?: string; actionId?: string }) => {
    if (method !== "surface.get") return { ok: false as const, error: `unsupported ForgeGraph RPC method: ${method}` };
    const snapshot = coordinator.snapshot ?? (await coordinator.refresh());
    return { ok: true as const, result: buildSurfaceModel(snapshot, payload?.navigationId) };
  };
}

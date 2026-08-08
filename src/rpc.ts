import type { DeliveryPollingCoordinator } from "./forgegraph.ts";

type Request = { readonly method: string };
type Response = { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly error: string };

export function createForgeGraphRpcHandler(coordinator: DeliveryPollingCoordinator) {
  return async (request: Request): Promise<Response> => {
    try {
      switch (request.method) {
        case "delivery.status":
          return { ok: true, result: coordinator.snapshot ?? await coordinator.refresh() };
        case "delivery.refresh":
          return { ok: true, result: await coordinator.refresh() };
        default:
          return { ok: false, error: `unsupported ForgeGraph RPC method: ${request.method}` };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "ForgeGraph status request failed" };
    }
  };
}

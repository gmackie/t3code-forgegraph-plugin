import { buildReviewWorkflow, buildSurfaceModel, type DeliverySnapshot } from "./forgegraph.ts";

export function createRpcHandler(coordinator: {
  snapshot: DeliverySnapshot | null;
  refresh(): Promise<DeliverySnapshot>;
  workflowState?: { approved: boolean; executionRequested?: boolean };
  saveWorkflowState?: () => Promise<void>;
  executeDelivery?: (input: { stage?: string }) => Promise<{ reference?: string }>;
}) {
  const workflowState = coordinator.workflowState ?? { approved: false };
  return async (method: string, payload?: { navigationId?: string; panelId?: string; actionId?: string; workflowId?: string; input?: unknown }) => {
    if (method === "workflow.get") return { ok: true as const, result: buildReviewWorkflow(coordinator.snapshot ?? (await coordinator.refresh()), workflowState) };
    if (method === "action.execute" && payload?.actionId === "approve") {
      workflowState.approved = true;
      await coordinator.saveWorkflowState?.();
      return { ok: true as const, result: { status: "accepted" as const, message: "Delivery action approved." } };
    }
    if (method === "action.execute" && payload?.actionId === "execute") {
      if (!workflowState.approved) return { ok: false as const, error: "Delivery workflow must be approved before execution." };
      const input = payload.input && typeof payload.input === "object" ? payload.input as Record<string, unknown> : {};
      const result = await coordinator.executeDelivery?.({ stage: typeof input.stage === "string" ? input.stage : undefined });
      workflowState.executionRequested = true;
      await coordinator.saveWorkflowState?.();
      return { ok: true as const, result: { status: "accepted" as const, message: result?.reference ? `Delivery action ${result.reference} queued.` : "Delivery action queued." } };
    }
    if (method !== "surface.get") return { ok: false as const, error: `unsupported ForgeGraph RPC method: ${method}` };
    const snapshot = coordinator.snapshot ?? (await coordinator.refresh());
    return { ok: true as const, result: buildSurfaceModel(snapshot, payload?.navigationId) };
  };
}

import type { DeploymentRecord, ForgeGraphCommandRunner, ForgeGraphStatus, PullRequestRecord } from "./types.ts";

export const MIN_POLLING_SECONDS = 15;
export const MAX_POLLING_SECONDS = 3600;

export function normalizePollingSeconds(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.min(MAX_POLLING_SECONDS, Math.max(MIN_POLLING_SECONDS, Math.round(value)));
}

function parseJson<T>(output: string, command: string): T {
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new Error(`ForgeGraph returned invalid JSON for ${command}`);
  }
}

export function createForgeGraphClient(run: ForgeGraphCommandRunner) {
  return {
    async execute(args: readonly string[]): Promise<string> {
      return run(args);
    },
    async listPullRequests(): Promise<readonly PullRequestRecord[]> {
      return parseJson<readonly PullRequestRecord[]>(await run(["pr", "list", "--json"]), "fg pr list");
    },
    async listDeployments(stage: string): Promise<readonly DeploymentRecord[]> {
      return parseJson<readonly DeploymentRecord[]>(await run(["deploy", "history", "--stage", stage, "--json"]), "fg deploy history");
    },
    async status(): Promise<ForgeGraphStatus> {
      return parseJson<ForgeGraphStatus>(await run(["status", "--json"]), "fg status");
    },
  };
}

export function summarizeDelivery(input: {
  readonly pullRequests: readonly PullRequestRecord[];
  readonly deployments: readonly DeploymentRecord[];
}): { readonly openPullRequests: number; readonly failingChecks: number; readonly activeDeployments: number; readonly failedDeployments: number } {
  return {
    openPullRequests: input.pullRequests.filter((pr) => pr.state === "open" || pr.state === "draft").length,
    failingChecks: input.pullRequests.filter((pr) => pr.checks === "failing").length,
    activeDeployments: input.deployments.filter((deployment) => deployment.status === "active" || deployment.status === "deploying").length,
    failedDeployments: input.deployments.filter((deployment) => deployment.status === "failed").length,
  };
}

export type DeliverySnapshot = {
  readonly status: ForgeGraphStatus;
  readonly pullRequests: readonly PullRequestRecord[];
  readonly deployments: readonly DeploymentRecord[];
};
export type ReviewWorkflowModel = {
  readonly pluginId: string;
  readonly workflowId: string;
  readonly title: string;
  readonly currentStage: "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond";
  readonly refreshedAt: string;
  readonly steps: readonly { id: string; stage: ReviewWorkflowModel["currentStage"]; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[];
  readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: "neutral" | "positive" | "warning" | "negative"; detail?: string; url?: string }[];
  readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[];
};
export function buildReviewWorkflow(input: Pick<DeliverySnapshot, "pullRequests" | "deployments">, state: { readonly approved?: boolean; readonly executionRequested?: boolean } = {}): ReviewWorkflowModel {
  const hasRisk = input.pullRequests.some((pr) => pr.checks === "failing") || input.deployments.some((deployment) => deployment.status === "failed");
  const steps = [
    { id: "inspect", stage: "inspect" as const, title: "Inspect delivery state", state: "completed" as const },
    { id: "context", stage: "context" as const, title: "Build evidence context", state: "completed" as const, detail: `${input.pullRequests.length} pull requests · ${input.deployments.length} deployments` },
    { id: "propose", stage: "propose" as const, title: "Propose delivery response", state: "completed" as const, detail: hasRisk ? "Risk-bearing changes need review." : "No delivery blockers detected." },
    { id: "review", stage: "review" as const, title: "Review proposed response", state: state.approved ? "completed" as const : "active" as const },
    { id: "approve", stage: "approve" as const, title: "Approve execution", state: state.approved ? "completed" as const : "pending" as const },
    { id: "execute", stage: "execute" as const, title: "Execute delivery action", state: state.executionRequested ? "completed" as const : state.approved ? "active" as const : "pending" as const },
    { id: "verify", stage: "verify" as const, title: "Verify delivery result", state: state.executionRequested ? "active" as const : "pending" as const },
    { id: "respond", stage: "respond" as const, title: "Prepare stakeholder response", state: "pending" as const },
  ];
  return { pluginId: "com.t3code.forgegraph", workflowId: "forgegraph.delivery-review", title: "Delivery review", currentStage: state.executionRequested ? "verify" : state.approved ? "execute" : "review", refreshedAt: new Date().toISOString(), steps, evidence: [{ id: "checks", title: "Delivery checks", kind: "check", status: hasRisk ? "negative" : "positive", detail: `${input.pullRequests.length} pull requests and ${input.deployments.length} deployments inspected` }], actions: state.executionRequested ? [] : state.approved ? [{ id: "execute", title: "Execute delivery action", tone: "primary" }] : [{ id: "approve", title: "Approve delivery action", tone: "primary" }] };
}
export type DeliveryCockpitViewModel = { navigation: readonly string[]; metrics: ReturnType<typeof summarizeDelivery> };
export type SurfaceCard =
  | { kind: "metric"; id: string; title: string; value: string; detail?: string; status?: "neutral" | "positive" | "warning" | "negative" }
  | { kind: "list"; id: string; title: string; items: readonly { id: string; title: string; detail?: string; status?: "neutral" | "positive" | "warning" | "negative"; url?: string }[] };
export type SurfaceModel = { pluginId: string; navigationId: string; title: string; refreshedAt: string; cards: readonly SurfaceCard[] };
export function buildCockpitViewModel(metrics: ReturnType<typeof summarizeDelivery>): DeliveryCockpitViewModel { return { navigation: ["overview", "changes", "checks", "deployments", "environments", "releases"], metrics }; }
export function buildSurfaceModel(snapshot: DeliverySnapshot, navigationId = "forgegraph.overview"): SurfaceModel {
  const metrics = summarizeDelivery(snapshot);
  return {
    pluginId: "com.t3code.forgegraph",
    navigationId,
    title: "Delivery graph",
    refreshedAt: new Date().toISOString(),
    cards: [
      { kind: "metric", id: "open-prs", title: "Open changes", value: `${metrics.openPullRequests}` },
      { kind: "metric", id: "failing-checks", title: "Failing checks", value: `${metrics.failingChecks}`, status: metrics.failingChecks === 0 ? "positive" : "negative" },
      { kind: "metric", id: "active-deployments", title: "Active deployments", value: `${metrics.activeDeployments}`, status: metrics.failedDeployments === 0 ? "positive" : "negative" },
      { kind: "list", id: "changes", title: "Recent changes", items: snapshot.pullRequests.slice(0, 8).map((pr) => ({ id: pr.id, title: pr.title, detail: `${pr.state} · ${pr.checks ?? "checks unknown"}`, status: pr.checks === "failing" ? "negative" as const : pr.checks === "passing" ? "positive" as const : "warning" as const, ...(pr.url ? { url: pr.url } : {}) })) },
      { kind: "list", id: "deployments", title: "Deployments", items: snapshot.deployments.slice(0, 8).map((deployment) => ({ id: deployment.id, title: deployment.stage, detail: deployment.status, status: deployment.status === "failed" ? "negative" as const : deployment.status === "active" ? "positive" as const : "warning" as const, ...(deployment.url ? { url: deployment.url } : {}) })) },
    ],
  };
}

export type DeliverySnapshotLoader = () => Promise<DeliverySnapshot>;

/** Polls read-only delivery state and keeps scheduling owned by the plugin process. */
export class DeliveryPollingCoordinator {
  readonly #load: DeliverySnapshotLoader;
  readonly #onSnapshot: (snapshot: DeliverySnapshot) => void;
  readonly #onError: (error: unknown) => void;
  #intervalSeconds: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;
  #lastSnapshot: DeliverySnapshot | undefined;

  constructor(input: {
    load: DeliverySnapshotLoader;
    onSnapshot: (snapshot: DeliverySnapshot) => void;
    onError?: (error: unknown) => void;
    intervalSeconds: number;
  }) {
    this.#load = input.load;
    this.#onSnapshot = input.onSnapshot;
    this.#onError = input.onError ?? (() => undefined);
    this.#intervalSeconds = normalizePollingSeconds(input.intervalSeconds);
  }

  get intervalSeconds(): number {
    return this.#intervalSeconds;
  }

  setIntervalSeconds(value: number): void {
    this.#intervalSeconds = normalizePollingSeconds(value);
    if (this.#running) this.#schedule();
  }

  async refresh(): Promise<DeliverySnapshot> {
    const snapshot = await this.#load();
    this.#lastSnapshot = snapshot;
    this.#onSnapshot(snapshot);
    return snapshot;
  }

  get snapshot(): DeliverySnapshot | undefined {
    return this.#lastSnapshot;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    void this.#tick();
  }

  stop(): void {
    this.#running = false;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  async #tick(): Promise<void> {
    if (!this.#running) return;
    try {
      await this.refresh();
    } catch (error) {
      this.#onError(error);
    } finally {
      if (this.#running) this.#schedule();
    }
  }

  #schedule(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#tick(), this.#intervalSeconds * 1000);
  }
}

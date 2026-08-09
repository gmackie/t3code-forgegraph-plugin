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

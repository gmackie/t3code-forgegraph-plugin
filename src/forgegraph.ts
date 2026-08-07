import type { DeploymentRecord, ForgeGraphCommandRunner, ForgeGraphStatus, PullRequestRecord } from "./types.ts";

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

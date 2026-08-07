export type ForgeGraphCommandRunner = (args: readonly string[]) => Promise<string>;

export type PullRequestRecord = {
  readonly id: string;
  readonly number?: number;
  readonly title: string;
  readonly url?: string;
  readonly state: "open" | "merged" | "closed" | "draft";
  readonly headBranch?: string;
  readonly baseBranch?: string;
  readonly checks?: "pending" | "passing" | "failing";
  readonly updatedAt?: string;
};

export type DeploymentRecord = {
  readonly id: string;
  readonly app?: string;
  readonly stage: string;
  readonly status: "pending" | "deploying" | "active" | "failed" | "rolled_back";
  readonly commitSha?: string;
  readonly url?: string;
  readonly deployedAt?: string;
};

export type ForgeGraphStatus = {
  readonly app?: string;
  readonly currentSha?: string;
  readonly stages: readonly string[];
  readonly deployments: readonly DeploymentRecord[];
};

import { createTeamConfiguration } from "../../packages/team-runtime/team-config";

const parser = createTeamConfiguration({
  capabilities: new Set(["audit"]), defaultCapabilities: ["audit"],
  deployments: { audit: { workerProfile: "audit", workerService: "audit-worker" } },
  retentionScheduleSettings: () => ({ intervalSeconds: 300 })
});
const config = parser.loadTeamConfig({});
// @ts-expect-error parsed config is immutable
config.workerLeaseSeconds = 20;
// @ts-expect-error parsed numeric settings are numbers
const invalid: string = config.projectActiveJobLimit;
// @ts-expect-error capabilities cannot be mutated
config.enabledCapabilities.push("unknown");
// @ts-expect-error deployment plan cannot be mutated
parser.teamDeploymentPlan(undefined).workerServices.push("unknown");
void invalid;

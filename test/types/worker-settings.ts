import { environmentString, parsePollSeconds, readWorkerSettings } from "../../packages/remote-mcp-server/worker-settings";

declare const external: unknown;
const settings = readWorkerSettings(external, {
  capability: "ppt-quality",
  capabilityError: "invalid capability",
  workerIdPrefix: "team-ppt-quality-worker-"
});
const pollSeconds: number = settings.pollSeconds;
const workerId: string = settings.workerId;
const environmentValue: string | undefined = environmentString(external, "COMMON_TOOLS_WORKER_ID");
// @ts-expect-error Parsed poll values require a string boundary value.
parsePollSeconds(external);
// @ts-expect-error Worker settings preserve scalar output types.
const invalidWorkerId: number = workerId;
void pollSeconds;
void environmentValue;
void invalidWorkerId;

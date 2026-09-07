import { assertLeaseAttempt, assertLeaseSeconds, attemptOutputPrefix } from "../../packages/team-runtime/worker-lease";
declare const external: unknown;
const attempt: number = assertLeaseAttempt(external);
const duration: number = assertLeaseSeconds(external);
// @ts-expect-error Validated lease inputs are numbers, never strings.
const text: string = assertLeaseAttempt(external);
// @ts-expect-error Validation does not turn the original unknown input into a job.
external.attempt;
const prefix: string = attemptOutputPrefix(external, external);
// @ts-expect-error Namespace projection returns a string, not a parsed job.
prefix.outputPrefix;

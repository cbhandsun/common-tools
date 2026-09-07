import { createJobFactory, withTraceParent } from "../../packages/team-runtime/job-input";
const createJob = createJobFactory(["project-audit"]);
const job = createJob({});
const attempts: number = job.maxAttempts;
const status: "queued" = job.status;
void attempts; void status;
// @ts-expect-error parsed Job properties are immutable
job.maxAttempts = 5;
// @ts-expect-error parsed owner IDs are strings
const invalid: number = job.ownerId;
void invalid;
// @ts-expect-error trace metadata must be a string or undefined
withTraceParent({ id: "fixture" }, 42);
// @ts-expect-error capability definitions are not arbitrary objects
createJobFactory({ capability: "project-audit" });

import { readJobRowState } from "../../packages/team-runtime/job-row-state.js";
const rowState = readJobRowState({});
const rowAttempt: number = rowState.attempt;
void rowAttempt;
// @ts-expect-error decoded state is immutable
rowState.attempt = 2;
// @ts-expect-error input payload is not returned
void rowState.headers;

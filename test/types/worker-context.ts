import {createWorkerJob,createWorkerHandlerContext} from "../../packages/team-runtime/worker-context.js";
declare const external: unknown;
const job=createWorkerJob(external);
const context=createWorkerHandlerContext(job,async()=>false);
const attempt:number=context.job.attempt; void attempt;
// @ts-expect-error attempt identity is immutable
context.job.attempt=2;
// @ts-expect-error cancellation result must be boolean
createWorkerHandlerContext(job,async()=>"false");

import {createJobRowReader} from "../../packages/team-runtime/job-row-reader.js";
declare const raw: unknown;
const job=createJobRowReader(["image-to-editable"])(raw);
const count:number=job.attempt; void count;
// @ts-expect-error persisted Job is immutable
job.attempt=4;
// @ts-expect-error arbitrary database columns are not exposed
void job.headers;
const hash:string | undefined=job.artifacts[0]?.sha256; void hash;

import {createWorkerRunner} from "../../packages/team-runtime/worker-runner.js";
const Runner=createWorkerRunner(new Set(["project-audit"]));
const runner=new Runner({queue:{reserve:async()=>null,ack:async()=>{}},worker:{process:async()=>null},workerId:"worker",capability:"project-audit"});
void runner.processOne();
// @ts-expect-error reserve must be async
new Runner({queue:{reserve:()=>null,ack:async()=>{}},worker:{process:async()=>null},workerId:"worker",capability:"project-audit"});

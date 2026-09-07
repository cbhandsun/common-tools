import {normalizePptxBuildJobs} from "../../packages/slideclone-core/pptx-build-execution";
const input: unknown = null;
const jobs = normalizePptxBuildJobs(input);
const output: string | undefined = jobs[0]?.outFile;
// @ts-expect-error Normalized paths are strings.
const incorrect: number = jobs[0]?.outFile;
void output;
void incorrect;

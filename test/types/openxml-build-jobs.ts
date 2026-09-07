import { normalizeBuildJobs } from "../../packages/slideclone-core/openxml-build-jobs";
declare const input: unknown;
const jobs = normalizeBuildJobs(input);
const first = jobs[0];
if (first) {
  const file: string = first.irFile;
  void file;
  // @ts-expect-error Normalized paths are strings.
  const invalid: number = first.outFile;
  void invalid;
  // @ts-expect-error Normalized template paths cannot be assigned unknown values.
  first.templatePptx = input;
}

import { createOcrCheckpoint } from "../../packages/slideclone-core/ocr-checkpoint";

const run = createOcrCheckpoint({ objectStore: {}, profileFingerprint: "" });
const result = run({ job: {}, source: {}, runOcr: null, isCancellationRequested: null });
void result.then(ocr => {
  const confidence: number | undefined = ocr.lines[0]?.confidence;
  void confidence;
  // @ts-expect-error OCR lines are validated read-only data.
  ocr.lines.push({});
});

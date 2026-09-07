import { admitOcrResult } from "../../packages/slideclone-core/ocr-result-admission";
const result = admitOcrResult({} as unknown, {} as unknown);
const confidence: number | undefined = result.lines[0]?.confidence;
// @ts-expect-error canonical line collection is readonly
result.lines.push({ text: "bad", confidence: 1, box: { x: 0, y: 0, w: 1, h: 1 } });
void confidence;

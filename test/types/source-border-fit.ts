import { fitSourceBorders } from "../../packages/slideclone-core/source-border-fit";

const input: unknown = {};
const result = fitSourceBorders(input);
const count: number = result.evidence.accepted;
void count;
// @ts-expect-error The result counter cannot contain source text.
const text: string = result.evidence.accepted;
void text;
// @ts-expect-error Preserved non-target shapes remain unknown at this boundary.
result.shapes[0].box;

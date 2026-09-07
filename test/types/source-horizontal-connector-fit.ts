import { fitSourceHorizontalConnectors } from "../../packages/slideclone-core/source-horizontal-connector-fit";

const input: unknown = {};
const result = fitSourceHorizontalConnectors(input);
const accepted: number = result.evidence.accepted;
void accepted;
// @ts-expect-error Evidence counts must remain numeric.
const invalid: string = result.evidence.accepted;
void invalid;
// @ts-expect-error Non-target shapes are not claimed as validated geometry.
result.shapes[0].box;

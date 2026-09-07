import { fitKnowledgeGraphGrayNodes } from "../../packages/slideclone-core/knowledge-graph-gray-node-fit";
import { cleanGrayBorderPixels } from "../../packages/slideclone-core/gray-border-pixels";
const input: unknown = {};
const fit = fitKnowledgeGraphGrayNodes(input);
const accepted: number = fit.evidence.accepted;
const cleaned: number = cleanGrayBorderPixels(input).changedPixels;
void accepted; void cleaned;
// @ts-expect-error Preserved unknown shapes do not establish validated geometry.
fit.shapes[0].box;
// @ts-expect-error Pixel count does not expose source content.
const invalid: string = cleanGrayBorderPixels(input).changedPixels;
void invalid;

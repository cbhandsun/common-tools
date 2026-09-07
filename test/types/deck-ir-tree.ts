import { validateDeckIrTree, validateDeckIrEnvelope } from "../../packages/slideclone-core/deck-ir-tree";
declare const value: unknown;
validateDeckIrTree(value, 518400);
// @ts-expect-error Page area bounds must be numeric.
validateDeckIrTree(value, "518400");
const envelope = validateDeckIrEnvelope(value);
const width: number = envelope.widthPt;
// @ts-expect-error The envelope validates outer dimensions, not every page field.
const pageIndex: number = envelope.pages[0].pageIndex;
void width;
void pageIndex;

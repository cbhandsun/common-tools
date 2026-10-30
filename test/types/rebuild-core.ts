import { parsePageSelection, planSelectedPages } from "../../packages/slideclone-core/scene-plan/page-selection.js";
import { boundedOcrSourceDeck } from "../../packages/slideclone-core/ocr/ocr-source-deck.js";
import { buildMinimumUnitCropEvidence } from "../../packages/slideclone-core/quality/graphic-crop-policy.js";

declare const external: unknown;
const selection = parsePageSelection(external);
const plan = planSelectedPages([{ id: "fixture" }], selection);
const deck = boundedOcrSourceDeck(external);
const evidence = buildMinimumUnitCropEvidence(external);
const width: number = deck.slideSize.widthPt;
void width;

// @ts-expect-error Validated page selections cannot contain strings.
selection?.add("1");
// @ts-expect-error Page plans retain the actual input page type.
const incorrect: number = plan[0]!.page.id;
void incorrect;
// @ts-expect-error Projected numeric geometry cannot become text.
deck.slideSize.widthPt = "960";
// @ts-expect-error Crop evidence coordinates are immutable after validation.
evidence.tightenedPixelBox.x = 5;

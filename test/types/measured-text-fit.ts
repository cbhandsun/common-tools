import { measureTextInkGeometry } from "../../packages/slideclone-core/text-ink-geometry";
import { planMeasuredSingleLineTextFit } from "../../packages/slideclone-core/measured-text-fit";
declare const input: unknown;
const measurement = measureTextInkGeometry(input);
const proposed = planMeasuredSingleLineTextFit(input);
const samples: number = measurement.samples;
const accepted: number = proposed.evidence.accepted;
// @ts-expect-error Coordinates are numeric, not arbitrary text.
const incorrect: string = measurement.measurements[0]!.source.x;
void [samples, accepted, incorrect];

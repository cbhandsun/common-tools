import { detectLongLines, detectEntropyMicroComponents, pixel, ptLineToPxMask, sampleMaskBackgroundColor, median, mergeAxisRuns } from "../../packages/slideclone-core/raster-native-detection";

const raster = { width: 10, height: 10, rgba: new Uint8Array(400) };
const slide = { widthPt: 960, heightPt: 540 };
const mask = ptLineToPxMask({ x: 0, y: 0, w: 10, h: 0 }, raster, slide);
sampleMaskBackgroundColor(raster, mask);
const lines = detectLongLines(raster, slide);
const coordinate: number | undefined = lines[0]?.box.x;
void coordinate;
// @ts-expect-error raster storage must be a byte array
detectLongLines({ width: 10, height: 10, rgba: "pixels" }, slide);
// @ts-expect-error mask endpoints must be numbers
sampleMaskBackgroundColor(raster, { kind: "line", x1: "0", y1: 0, x2: 10, y2: 0, width: 2 });
// @ts-expect-error axis is a closed union
mergeAxisRuns([], raster, slide, "diagonal");
// @ts-expect-error predicates must return a boolean
detectEntropyMicroComponents(raster, slide, { predicate: () => "yes" });
// @ts-expect-error color channels remain numeric
const invalidColor: string = pixel(raster, 0, 0).r;
void invalidColor;
// @ts-expect-error an empty median remains potentially undefined
const invalidMedian: number = median([]);
void invalidMedian;

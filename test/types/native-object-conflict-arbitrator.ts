import { arbitrateNativeObjectOwnership, DEFAULT_OWNER_RULES, intersectionCoverage, normalizeBox, unionBoxes } from "../../packages/slideclone-core/native-object-conflict-arbitrator";

const result = arbitrateNativeObjectOwnership([
  { id: "native", source: { detector: "title" }, payload: { count: 3 } }
], { rules: DEFAULT_OWNER_RULES });
const count: number | undefined = result.items[0]?.payload.count;
void count;
// @ts-expect-error Retained item payload must preserve its original type.
const text: string | undefined = result.items[0]?.payload.count;
void text;
// @ts-expect-error Detector names must be strings at the internal stage boundary.
arbitrateNativeObjectOwnership([{ source: { detector: 42 } }]);
// @ts-expect-error Custom rule coverage must be numeric.
arbitrateNativeObjectOwnership([], { rules: [{ minCandidateCoverage: "0.6" }] });
// @ts-expect-error Custom text matching modes are a closed union.
arbitrateNativeObjectOwnership([], { rules: [{ ownerTextMatch: "approximate" }] });
// @ts-expect-error Default ownership rules cannot be mutated.
DEFAULT_OWNER_RULES[0]?.dropFamilies.push("injected");
const box = normalizeBox({ x: "1", y: 2, w: 3, h: 4 });
if (box) {
  const coverage: number = intersectionCoverage(box, unionBoxes([box]));
  void coverage;
}
// @ts-expect-error Geometry helpers require complete normalized boxes.
intersectionCoverage({ x: 1, y: 2 }, { x: 0, y: 0, w: 3, h: 4 });

import { createArcResidualMasks } from "../../packages/slideclone-core/arc-residual-masks";

const masks = createArcResidualMasks({ x: 0, y: 0, w: 10, h: 5 }, [], { width: 100, height: 100 }, 4);
const first = masks[0];
if (first) {
  const width: number = first.width;
  void width;
  // @ts-expect-error Line masks have numeric coordinates.
  const invalid: string = first.x1;
  void invalid;
}
// @ts-expect-error Arc boxes must have numeric dimensions.
createArcResidualMasks({ x: 0, y: 0, w: "10", h: 5 }, [], { width: 100, height: 100 }, 4);

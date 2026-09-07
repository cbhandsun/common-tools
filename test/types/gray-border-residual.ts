import { refineGrayBorderResiduals } from "../../packages/slideclone-core/gray-border-residual";
const input = { page: {} as unknown, slideSize: {} as unknown, sourceFile: "" as unknown, root: "" as unknown };
async function verify() {
  const result = await refineGrayBorderResiduals(input);
  const count: number = result.changedPixels;
  void count;
  // @ts-expect-error Evidence must not contain pixel content as a string.
  const invalid: string = result.changedPixels;
  void invalid;
}
void verify;

import { parseSlideSize } from "../../packages/slideclone-core/slide-size";
declare const external: unknown;
const size = parseSlideSize(external);
// @ts-expect-error Untrusted input may not supply a valid size.
const unsafe: number = size.widthPt;
if (size) {
  const width: number = size.widthPt;
  // @ts-expect-error Parsed sizes are numeric, not string dimensions.
  const text: string = size.heightPt;
  // @ts-expect-error Input extras do not enter the parsed size.
  size.private;
}

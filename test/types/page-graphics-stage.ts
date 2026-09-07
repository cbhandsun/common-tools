import { createPageGraphicsStage } from "../../packages/slideclone-core/page-graphics-stage";
declare const external: unknown;
const stage = createPageGraphicsStage(external);
const result = stage.preparePageGraphics(external);
const underlay: boolean = result.useUnderlay;
// @ts-expect-error Stage output collections are not arbitrary strings.
const text: string = result.images;
// @ts-expect-error Individual objects still require schema validation before using their geometry.
const width: number = result.images[0]!.width;
// @ts-expect-error Factory state cannot be replaced with unrelated values.
stage.preparePageGraphics = 1;

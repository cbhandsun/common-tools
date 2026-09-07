import {createToolGapPlatformDiagramObjects, shouldObjectifyToolGapPlatformDiagram} from "../../packages/slideclone-core/tool-platform-reconstruction";
const external: unknown = undefined;
const result = createToolGapPlatformDiagramObjects(external, external, external, external);
const count: number = result.shapes.length;
const eligible: boolean = shouldObjectifyToolGapPlatformDiagram(external, external, external);
// @ts-expect-error Output collection length is numeric.
const invalid: string = result.shapes.length;
void count;
void eligible;
void invalid;

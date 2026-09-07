import { createPageShapeFinalizer, type Operations, type Inputs, type Page } from "../../packages/slideclone-core/page-shape-finalizer";
declare const operations: Operations;
declare const inputs: Inputs;
declare const page: Page;
const result = createPageShapeFinalizer(operations)(page, inputs);
const active: boolean = result.productBrainCoreValueHybridActive;
void active;
// @ts-expect-error All named operations must be supplied.
createPageShapeFinalizer({});
// @ts-expect-error Flags are not strings.
inputs.useUnderlay = "false";
// @ts-expect-error Detector prefixes are strings.
inputs.CLI_SCAFFOLD_GENERATOR_DETECTOR_PREFIX = 1;

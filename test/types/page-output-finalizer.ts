import { createPageOutputFinalizer, type Inputs, type Operations, type Page } from "../../packages/slideclone-core/page-output-finalizer";
declare const inputs: Inputs;
declare const operations: Operations;
declare const page: Page;
const result: Page = createPageOutputFinalizer(operations)(page, inputs);
void result;
// @ts-expect-error A complete set of synchronous services is required.
createPageOutputFinalizer({});
// @ts-expect-error Output paths cannot be numbers.
inputs.options.irDir = 3;
// @ts-expect-error Fidelity policy switches are booleans.
inputs.allowEntropyNativeApproximation = "false";

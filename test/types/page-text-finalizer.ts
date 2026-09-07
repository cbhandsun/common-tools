import { createPageTextFinalizer, type Operations, type Inputs, type Page } from "../../packages/slideclone-core/page-text-finalizer";
declare const operations: Operations;
declare const inputs: Inputs;
declare const page: Page;
const final: Page = createPageTextFinalizer(operations)(page, inputs);
void final;
// @ts-expect-error All named operations are required.
createPageTextFinalizer({});
// @ts-expect-error Internal stage flags cannot be strings.
inputs.visualOperationSyncActive = "true";
// @ts-expect-error Page collections cannot be arbitrary objects.
page.textBoxes = {};

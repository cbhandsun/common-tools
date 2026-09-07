import { createPageProgressLifecycle } from "../../packages/slideclone-core/page-progress-lifecycle";

declare const external: unknown;
const lifecycle = createPageProgressLifecycle(external);
const draft = { images: [], pageIndex: 2 };
const result: typeof draft = lifecycle.complete(draft, external);
const unknownResult = lifecycle.complete(external);
// @ts-expect-error Unknown drafts cannot be treated as validated Deck IR.
unknownResult.images;
// @ts-expect-error The returned draft retains its actual property types.
const invalid: string = result.pageIndex;
// @ts-expect-error There is no writable lifecycle state API.
lifecycle.completed = true;

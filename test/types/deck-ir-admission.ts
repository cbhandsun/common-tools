import { validateDeckIr, safeAssetPath } from "../../packages/slideclone-core/deck-ir-admission.js";
import { admitRebuiltPage } from "../../packages/slideclone-core/deck-ir-admission.js";
declare const external: unknown;
const result = validateDeckIr(external, "/workspace");
const pages: number = result.pages;
const assets: number = result.assets;
const safe: string = safeAssetPath(external);
void pages; void assets; void safe;
// @ts-expect-error workspace root is a trusted string, not arbitrary input
validateDeckIr(external, {});
// @ts-expect-error admission does not return unvalidated user fields
void result.headers;
const rebuilt = admitRebuiltPage(external, "/workspace");
// @ts-expect-error arbitrary delegate output fields do not become trusted through admission
void rebuilt.headers;

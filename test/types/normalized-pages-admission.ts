import {admitNormalizedPages} from "../../packages/slideclone-core/normalized-pages-admission.js";
declare const input: unknown;
const result=admitNormalizedPages(input,"/workspace");
// @ts-expect-error canonical source collection is immutable
result.sources.push({});
// @ts-expect-error arbitrary input fields are not propagated
void result.headers;

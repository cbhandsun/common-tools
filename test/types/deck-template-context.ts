import {validateDeckTemplateContext} from "../../packages/slideclone-core/deck-template-context";
import {admitTemplateBuild} from "../../packages/slideclone-core/template-build-admission";
declare const external: unknown;
validateDeckTemplateContext(external, external);
const result: Promise<void> = admitTemplateBuild(external);
// @ts-expect-error Admission is asynchronous and cannot be used as a boolean.
const invalid: boolean = admitTemplateBuild(external);
void [result, invalid];

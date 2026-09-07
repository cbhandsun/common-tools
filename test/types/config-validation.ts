import { assertValidConfig, validateConfig } from "../../packages/slideclone-core/config-validation";

declare const input: unknown;
const result = validateConfig(input);
const valid: boolean = result.ok;
const errors: string[] = result.errors;
// @ts-expect-error Diagnostics remain strings, not arbitrary input objects.
errors.push({ content: "invalid" });
const checked = assertValidConfig(input);
// @ts-expect-error Partial runtime validation must not pretend to establish the complete config shape.
checked.adapters.ocr;
const retained = assertValidConfig({ inputDir: "input" });
const path: string = retained.inputDir;
// @ts-expect-error A string path is not a numeric field.
const numericPath: number = retained.inputDir;
void [valid, path, numericPath];

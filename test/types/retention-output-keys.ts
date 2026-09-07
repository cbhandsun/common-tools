import { collectRetentionOutputKeys } from "../../packages/team-runtime/retention-output-keys";
declare const external: unknown;
collectRetentionOutputKeys({ prefix: external, listPage: async () => external }).then((keys) => {
  const checked: string[] = keys;
  // @ts-expect-error Validated object keys are strings.
  keys.push(42);
  // @ts-expect-error Listing validation does not return arbitrary response metadata.
  keys.secret;
});

import { NATIVE_REBUILDER_POLICIES, nativeOwnershipRules, classifyNativeRebuilderFamily } from "../../packages/slideclone-core/native-rebuilder-policy";
const family: string = classifyNativeRebuilderFamily("unknown");
void family;
const rule = nativeOwnershipRules()[0];
if (rule) {
  const targets: readonly string[] = rule.dropFamilies;
  void targets;
  // @ts-expect-error Drop families are immutable.
  rule.dropFamilies.push("injected");
}
// @ts-expect-error Policies cannot be removed by consumers.
NATIVE_REBUILDER_POLICIES.pop();

import { admitSemanticArcs } from "../../packages/slideclone-core/semantic-arc-admission";

const input: unknown = {};
const result = admitSemanticArcs(input);
const count: number = result.evidence.rejected;
void count;
// @ts-expect-error Admission counters are numeric, never user-supplied text.
const text: string = result.evidence.accepted;
void text;

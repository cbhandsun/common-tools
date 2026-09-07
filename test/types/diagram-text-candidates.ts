import { collectDiagramTextCandidates, PRODUCER_FIELDS } from "../../packages/slideclone-core/diagram-text-candidates";

const incoming: unknown = [{ source: {} }];
const candidates = collectDiagramTextCandidates(incoming);
const first = candidates[0];
if (first) {
  // @ts-expect-error Metadata remains unknown until the consumer narrows it.
  const text: string = first.text;
  void text;
}
// @ts-expect-error Producer precedence is immutable.
PRODUCER_FIELDS.push("unregistered");

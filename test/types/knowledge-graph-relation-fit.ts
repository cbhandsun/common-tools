import { fitKnowledgeGraphRelations } from "../../packages/slideclone-core/archetypes/knowledge-graph-relation-fit";
declare const input: unknown;
const result = fitKnowledgeGraphRelations(input);
const accepted: boolean = result.evidence.upperAccepted;
// @ts-expect-error Source evidence is numeric, not textual.
const invalid: string = result.evidence.samples;
void [accepted, invalid];

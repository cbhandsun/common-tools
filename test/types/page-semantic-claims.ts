import { createPageSemanticClaims } from "../../packages/slideclone-core/page-semantic-claims";
declare const operations: unknown;
declare const input: unknown;
const result = createPageSemanticClaims(operations).claimPageSemanticImages(input);
const matched: boolean = result.skillsCapabilityMatrix.matched;
void matched;
// @ts-expect-error Matched status is boolean, not a string.
const invalid: string = result.demandIntakeFunnel.matched;
void invalid;
// @ts-expect-error Candidate collections cannot be assigned unknown input.
result.candidateImages = input;

# PPT commercial release roadmap

This document is the single planning source for the editable-image conversion and presentation-creation product. Architecture decisions remain authoritative for design constraints; workflows and reports remain authoritative for executable evidence.

Status values are `done`, `in progress`, `blocked`, and `planned`. A row may move to `done` only when every acceptance item is satisfied by immutable or repeatable evidence.

## Release objective

The current target is the first immutable commercial-release candidate, `v0.1.14`. Core engineering is Beta-ready; commercial release remains blocked until repository protection, an immutable release, a production deployment, and public end-to-end canaries are complete.

| Priority | Deliverable | Status | Acceptance criteria | Evidence | Owner role | Target |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Stable Office required check | in progress | Every pull request reports `office-regression-required`; relevant changes require the Office suite; unrelated changes pass through a tested no-op path | `.github/workflows/ppt-office-regression.yml`, `test/office-regression-scope.test.js` | Release engineering | v0.1.14 |
| P0 | Protect `main` | blocked | Required CI and Office checks, pull-request review, conversation resolution, no force push, no deletion | GitHub branch-protection API snapshot | Repository admin | v0.1.14 |
| P0 | First immutable release | blocked | Tag matches `package.json`; release workflow succeeds once; SBOM, signed evidence, GHCR digests, Cosign verification, attestations, and GitHub Release are present | `.github/workflows/release.yml`, GitHub Release URL | Release engineering | v0.1.14 |
| P0 | Marketplace immutable ref | blocked | installation guide and validated Marketplace configuration reference the released tag rather than `main` | `docs/git-marketplace-installation.md`, clean-machine install report | Product release | v0.1.14 |
| P0 | Production service deployment | blocked | digest-pinned images, `NODE_ENV=production`, production RBAC, managed secrets/IdP, monitoring and alert routing; `/healthz` returns only `{"status":"ok"}` | production preflight and deployment record | Platform operations | v0.1.14 |
| P0 | Public image conversion canary | blocked | OAuth + upload + job + download succeeds against production and validates the returned PPTX; failures alert without logging user content or credentials | redacted canary report | Platform operations | v0.1.14 |
| P1 | Public `ppt-create` capability | blocked | production worker deployed; capability allowlist and OAuth scope published; JSON spec, asset archive, and user-template archive pass remotely | three redacted canary reports | Platform operations | v0.1.15 |
| P1 | Clean-machine Marketplace canary | planned | immutable Marketplace install through PPTX download succeeds without a repository clone or undeclared local Runtime | clean-machine canary report | Release QA | v0.1.15 |
| P1 | Independent creation corpus | in progress | four themes and all 22 layouts; Chinese, English, mixed language; tables, charts, templates, assets, notes, citations; empty, invalid, long, and capacity boundaries; PowerPoint and LibreOffice | Office workflow artifacts and trend history | Presentation QA | v0.1.15 |
| P1 | Three compatible trend snapshots | blocked | three consecutive passing snapshots with the same environment fingerprint and no quality regression | quality-history snapshots | Presentation QA | v0.1.15 |
| P2 | Managed content and asset providers | planned | approved provider configuration, license evidence, bounded failures, retry policy, and security tests | provider acceptance report | Product/platform | post-v0.1.15 |
| P2 | Commercial operations | planned | user job history, quotas, retry UX, alert receivers, backup/restore drill, SLO/SLA and incident ownership | operations acceptance report | Product/platform | post-v0.1.15 |

## Existing capability baseline

| Capability | Engineering status | Current evidence |
| --- | --- | --- |
| Image/PDF/PPTX to editable PPT | done | Multi-page ingestion, OCR, native reconstruction, residual deduplication, connector semantics, cross-rendering gates, and the latest 31/31 Office run |
| Connector enhancement | done | Native connectors, anchors, semantic audit, orthogonal routing, and regression coverage |
| Presentation creation | done for local Beta | `PresentationBrief 1.0 → PresentationSpec 1.0 → Deck IR → PPTX/PDF/HTML`, four themes, 22 layouts, templates, assets, editor, notes, citations and variants |
| Shared generation architecture and copyright isolation | done | `docs/adr/0010-ppt-create-shared-generation-architecture.md` |
| Release supply-chain controls | done in code | Locked dependencies, SBOM, digest-bound images, Cosign, attestations, immutable release guard |
| Commercial public operation | blocked | Production identity, deployment, canaries, monitoring, backup and SLA evidence are incomplete |

## Execution order

1. Land the stable Office required check and make it a required `main` check together with CI.
2. Create and verify `v0.1.14`; record all immutable digests and release evidence.
3. Promote the recorded digests through the production overlay and run the public image-conversion canary.
4. Publish `ppt-create` in the production allowlist and OAuth scope, then run all three remote input canaries.
5. Complete the independent creation corpus and accumulate three compatible trend snapshots.
6. Close managed provider, monitoring, backup/restore, quota, retry and SLA work.

## Update rules

- Update this file in the same pull request whenever a roadmap item's status, acceptance criteria, evidence location, owner role, or target changes.
- Do not mark an external operation complete from source code alone. Link the immutable release, deployment, canary, or drill evidence.
- Never place tokens, cookies, headers, user content, private source paths, or secret-bearing logs in roadmap evidence.
- Architecture changes require an ADR; this roadmap links the outcome but does not replace the decision record.

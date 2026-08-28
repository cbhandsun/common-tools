# ADR 0010: PPT creation uses a shared semantic-to-OpenXML pipeline

- Status: Accepted
- Date: 2026-08-27

## Context

The product already converts slide images into editable presentations. It also needs a distinct capability for creating a new presentation from structured content. The capability must work both on a workstation and through the team service without maintaining two generation engines. External presentation projects can inform product questions, but copying their code, templates, assets, schemas, or layout coordinates would create provenance and maintenance risk.

## Decision

The user-facing action is **创建 PPT**. The stable capability ID is `ppt-create`, and the CLI entry point is `common-tools ppt create`. “生成” describes an internal execution stage, not the product capability name.

`PresentationSpec 1.0` is the bounded public input contract. It contains semantic slide roles and facts rather than rendering instructions. The repository owns the schema, validators, theme tokens, layout algorithms, tests, and generated artifacts.

Both execution modes use this pipeline:

`PresentationSpec -> validation -> semantic layout -> Deck IR -> OpenXML writer -> PPTX and quality report`

Local execution reads a workspace-contained JSON file. Remote execution accepts the same JSON through the existing owner-scoped upload and job APIs. Only the transport, storage, queue, and worker composition differ. The core planner and output contract remain shared.

The Runtime uses a repository-owned registry of four independently designed themes and fourteen semantic layouts. Content-aware selection produces one to three deterministic candidates from `seed`, semantic role, priority, item capacity, and adjacent-slide silhouette; a compatible explicit layout may override the first choice. Deck IR preserves the selected and candidate layout IDs. The implementation emits editable text and shapes and does not use third-party presentation assets or APIs. Output is written only to a new directory and includes `deck.ir.json`, `deck.pptx`, `ppt-create-report.json`, and `ppt-create-report.md`.

## Consequences

- Image-to-editable and new-deck creation converge at validated Deck IR and the existing OpenXML writer while keeping separate upstream inputs and quality metrics.
- A new theme or semantic role requires repository-owned fixtures, bounds tests, and rendering verification.
- Registry changes require unique stable IDs, role and capacity validation, deterministic candidate tests, and Marketplace/runtime release probes.
- Local and remote parity can be tested at the Deck IR and artifact-contract levels.
- Presentation text is treated as untrusted data and is excluded from logs and aggregate reports.
- Inspiration from external projects is limited to abstract workflow and product concepts. No external implementation, template, asset, proprietary schema, or distinctive coordinate system is imported.

## Rejected alternatives

- Calling the capability “生成 PPT”: this is less precise in navigation because image conversion and PPT improvement also generate files.
- Separate local and remote generators: this would create output drift and double the validation surface.
- HTML or raster slides as the primary output: these weaken editability and conflict with the existing Deck IR/OpenXML architecture.
- Importing a third-party theme or template catalog: this creates provenance, licensing, and long-term compatibility risk.

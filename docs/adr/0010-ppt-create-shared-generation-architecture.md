# ADR 0010: PPT creation uses a shared semantic-to-OpenXML pipeline

- Status: Accepted
- Date: 2026-08-27

## Context

The product already converts slide images into editable presentations. It also needs a distinct capability for creating a new presentation from structured content. The capability must work both on a workstation and through the team service without maintaining two generation engines. External presentation projects can inform product questions, but copying their code, templates, assets, schemas, or layout coordinates would create provenance and maintenance risk.

## Decision

The user-facing action is **创建 PPT**. The stable capability ID is `ppt-create`, and the CLI entry point is `common-tools ppt create`. “生成” describes an internal execution stage, not the product capability name.

`PresentationSpec 1.0` is the bounded public input contract. It contains semantic slide roles and facts rather than rendering instructions. The repository owns the schema, validators, theme tokens, layout algorithms, tests, and generated artifacts.

`PresentationBrief 1.0` is an optional upstream planning contract for long structured material. It records audience, purpose, bounded sections, semantic section modes, source points, and a slide budget. The deterministic planner preserves all source and required points, splits narrative sections only at repository-owned capacity boundaries, rejects incompatible semantic modes, and fails with the minimum required slide count instead of silently truncating content. Its only output is a fully validated PresentationSpec.

The local `ppt ingest` entry converts bounded Markdown, DOCX, or PDF source material into either a validated PresentationBrief or a planned PresentationSpec. Markdown headings and blocks and Word heading styles/paragraphs become semantic sections and points. DOCX admission validates the ZIP directory, CRC checksums, main-document content type, and decompression limits, and reads only `word/document.xml`; it does not execute macros, fields, external relationships, or embedded objects. PDF admission validates the container and invokes a fixed-argument `pdftotext` adapter in an isolated temporary directory. PDF text extraction supports semantic planning only and is not represented as visual-layout fidelity. Ingest reports contain hashes and aggregate counts rather than document text.

Both execution modes use this pipeline:

`PresentationSpec -> validation -> semantic layout -> Deck IR -> HTML / OpenXML PPTX -> controlled PDF export -> quality report`

Local execution reads a workspace-contained JSON file. Remote execution accepts the same JSON through the existing owner-scoped upload and job APIs. Only the transport, storage, queue, and worker composition differ. The core planner and output contract remain shared.

The Runtime uses a repository-owned registry of four independently designed themes and twenty-two semantic layouts. Content-aware selection produces one to three deterministic candidates from `seed`, semantic role, priority, item capacity, visual kind, and adjacent-slide silhouette; a compatible explicit layout may override the first choice. Deck IR preserves the selected and candidate layout IDs. The implementation emits editable text and shapes and does not bundle third-party presentation assets or call third-party presentation APIs. Output is written only to a new directory and includes Deck IR, preview HTML, printable HTML, PPTX, PDF, an asset manifest, and bounded JSON/Markdown reports.

The public spec may attach one bounded semantic visual to a slide. Tables become native editable PowerPoint tables, charts become native ChartParts with a hash-bound embedded workbook, and SWOT, quadrant, funnel, and timeline models become editable shapes and text. A media visual without an asset ID remains an explicit semantic slot. Local creation may bind an asset ID to a manifest entry whose path is relative to the PresentationSpec directory. The Runtime rejects absolute paths, traversal, symbolic files, unsupported formats, oversized or malformed images, excessive decoded dimensions, unused or missing IDs, and SHA-256 drift. Every admitted asset records its source kind, locator, and license; the delivered `asset-manifest.json` retains those fields without exposing the original absolute path. Verified PNG/JPEG files are copied into the new output, embedded as real PowerPoint image parts, rendered into the self-contained HTML, and may use bounded contain/cover fitting and normalized crop values.

Each creation also emits a self-contained HTML preview/editor generated from validated PresentationSpec and Deck IR. The browser may keep a local draft and download a bounded operation list, but it cannot write the source file. Persistence is a separate local Runtime command that verifies the source revision, operation schema, narrative order, layout compatibility, workspace boundary, and non-overwrite rule before atomically creating a new PresentationSpec file.

The read-only `deck.html`, editable `deck.pptx`, and `deck.pdf` share one Deck IR source fingerprint. PDF is exported from the generated PPTX by a fixed-argument LibreOffice adapter with an isolated profile; user input cannot select a command or add arguments. The Runtime validates PDF structure and exact page count, records the source fingerprint, and fails closed before publishing any partial artifact contract when formats diverge.

## Consequences

- Image-to-editable and new-deck creation converge at validated Deck IR and the existing OpenXML writer while keeping separate upstream inputs and quality metrics.
- Long structured briefs have a reviewable planning checkpoint before layout or rendering; generated specs can be edited and versioned independently.
- A new theme or semantic role requires repository-owned fixtures, bounds tests, and rendering verification.
- Registry changes require unique stable IDs, role and capacity validation, deterministic candidate tests, and Marketplace/runtime release probes.
- Local and remote parity can be tested at the Deck IR, editor preview, multi-format consistency, and artifact-contract levels.
- Presentation text is treated as untrusted data and is excluded from logs and aggregate reports.
- Local asset provenance is explicit and hash-bound. It records authorization evidence but does not itself grant rights; release owners remain responsible for the truth of supplied license metadata.
- Inspiration from external projects is limited to abstract workflow and product concepts. No external implementation, template, asset, proprietary schema, or distinctive coordinate system is imported.

## Rejected alternatives

- Calling the capability “生成 PPT”: this is less precise in navigation because image conversion and PPT improvement also generate files.
- Separate local and remote generators: this would create output drift and double the validation surface.
- HTML or raster slides as the primary output: these weaken editability and conflict with the existing Deck IR/OpenXML architecture.
- Importing a third-party theme or template catalog: this creates provenance, licensing, and long-term compatibility risk.

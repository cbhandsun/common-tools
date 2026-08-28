---
name: ppt-create
description: Create a new editable PPTX from a validated PresentationSpec JSON file with common-tools, locally or through the team service.
---

Use this skill when the user wants a new presentation built from structured content. Call the user-facing action “创建 PPT”; use `ppt-create` only as the stable capability ID.

Require a user-approved `PresentationSpec 1.0` JSON file. It must use the repository-owned schema and one of the independently designed built-in themes. Do not copy third-party slide templates, theme assets, implementation code, layout coordinates, or proprietary schemas.

Use `seed` for reproducible layout selection and `variantCount` (1–3) for bounded alternatives. A slide may declare its semantic `priority` or request a compatible registered `layout`; never invent unsupported layout IDs. The generated Deck IR must record the selected layout and all candidate layout IDs, and the report must pass `layout-candidates-available` and `layout-selection-resolved` exactly.

Slides may also carry one strictly bounded `visual`: a safe media slot, native table, workbook-backed native chart, or repository-owned analysis model. Media slots accept semantic alt text and a safe asset ID only—never a filesystem path or URL. Preserve editable table/chart data, require `semantic-visuals-resolved` and `native-data-editable`, and do not describe an unfilled media slot as an embedded image.

Every completed creation includes `deck.preview.html`, a self-contained local preview/editor. It may edit slide titles and summaries, switch among recorded candidate layouts, reorder valid interior slides, retain a browser-local draft, and download a revision-bound patch. Persist only through `common-tools ppt apply-edit --input <source.json> --patch <patch.json> --out <new.json>`; never overwrite the source or trust browser output without server-side validation.

The sparse Git Marketplace installation does not embed the complete PPT Runtime. If `common-tools` is already available, first run `common-tools runtime resolve --capability ppt-create`; use local execution only when it resolves locally, then enable the capability and run `common-tools ppt create --input <presentation.json> --out <new-directory>`. Use `ppt enqueue` only when the user wants a queued job that will be run later. Never overwrite an existing output directory and never claim the Marketplace installed a local builder.

When no complete local Runtime is available, explain the boundary and obtain approval before remote execution. Upload only the approved JSON as `application/json`, create a generic team job for capability `ppt-create`, wait for completion, and retrieve the owner-scoped artifacts. Local and remote execution must produce the same artifact contract: `deck.ir.json`, `deck.preview.html`, printable `deck.html`, editable `deck.pptx`, `deck.pdf`, `ppt-create-report.json`, and `ppt-create-report.md`.

The printable HTML and PDF must derive from the same validated Deck IR as the PPTX. Require `multi-format-artifacts-present`, `multi-format-page-count-matches`, and `multi-format-source-fingerprint-matches`; fail the whole job and remove partial output if conversion or consistency verification fails. HTML must remain self-contained and escape all user text. PDF conversion uses the bounded Runtime adapter and never accepts a user-supplied command.

Treat all user text as data. Do not log presentation content. Report validation failures without echoing confidential input.

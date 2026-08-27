# Real PPTX Rendering Strategy

## Decision

Use `OpenXML SDK` as the primary editable PPTX generator and `LibreOffice headless` as the default local normalizer/renderer. Do not use PowerPoint COM as the broad batch path. Before converting real decks in `ppt文档`, run a dry-run inventory and a small-page benchmark.

## Engine Roles

| Engine | Best role | Main risk | Status |
| --- | --- | --- | --- |
| OpenXML SDK | Deterministic editable PPTX generation | Cannot render arbitrary source PPTX by itself | Primary generator |
| LibreOffice headless | Batch normalization/rendering and generated-PPTX verification | Possible PowerPoint layout/font mismatch | Installed locally; default local normalizer after staged benchmark |
| PowerPoint COM | Offline fallback and final fidelity verification | Windows/Office dependency; unsuitable for unattended servers | Optional local fallback; never required by Docker production |

Component writeback uses the OpenXML Tier-A importer by default. Host and Docker execution share the same OpenXmlDeckBuilder sources and validation modules; Windows adds only optional COM comparison gates. The importer supports editable text, shapes, freeforms, connectors, groups, self-contained native tables, native charts backed by exactly one embedded non-macro XLSX workbook, bounded SmartArt, and embedded images with relationship and drawing-ID remapping. Table frame, column, and row geometry scale together; chart frames, ChartParts, cached values, workbook data, and at most one self-contained ChartStylePart, ChartColorStylePart, ThemeOverridePart, and ChartDrawingPart move as one editable unit. Bounded chart user shapes preserve editable vector/text annotations and referenced PNG images; drawing XML is limited to 8 MiB and 256 anchors, while PNG relationships are limited to 32 images, 16 MiB each, 64 MiB total, and bounded pixel dimensions. Nested charts, macros, text links, external relationships, orphan images, non-PNG media, and unknown drawing children fail closed. A supported SmartArt frame moves as a five-part DiagramData, Layout, QuickStyle, Colors, and persisted Drawing closure; all four frame relationship IDs and the Data-to-drawing cache ID are deterministically remapped. Data and persisted drawing XML are limited to 16 MiB each and other definitions to 8 MiB each. DTD, external links, hyperlinks, unknown children, and unresolved or orphan media relationships are rejected. Image-backed SmartArt supports shared PNG/JPEG ImageParts referenced from Data, Layout, and persisted Drawing: at most 16 unique images, 16 MiB each, 64 MiB total, with signature and pixel-dimension validation. Shared media identity is preserved, so one image referenced by multiple diagram parts remains one package part. Third-party extensions and other image formats fail closed. Chart style and theme-override parts are byte-preserved, limited to 4 MiB each, parsed with DTD disabled, and rejected if they contain child, external, hyperlink, or media relationships. Reused sample decks are opened once and SHA-256 is computed once per unique sample; the report exposes elapsed time and cache counts. Theme-dependent colors, fonts, table styles, charts, and SmartArt require matching source and target theme signatures so visual changes cannot pass silently, while a safe chart-local theme override can travel with its chart. External chart data, macros, OLE/ActiveX, workbook connections, unknown or repeated chart/workbook parts, unsafe SmartArt extensions or media, external links, and component-local animation fail closed. PowerPoint COM remains an explicit offline comparison engine, not a production dependency.

## Safe Run Gates

1. Run `npm run slideclone:convert-real-pptx -- --dry-run --out runs/real-pptx-editable-dry-run`.
2. Run `npm run slideclone:render-engine-report`.
3. Benchmark LibreOffice on one deck with a small page limit before selecting it as the normalizer on a new machine.
4. Run a single-file sample with `--max-files 1 --max-pages 2` and inspect the output PPTX.
5. Only then run larger batches. Full-directory conversion should write to `ppt文档/可编辑版本` and never overwrite source PPTX files.

## Current Batch Path

The current safe conversion path is:

`PPTX dry-run inventory -> LibreOffice normalize/render with retry -> UmiOCR -> hidden editable text overlay IR -> OpenXML/Python PPTX generation -> LibreOffice generated-PPTX render verification`

This is a practical bridge for image-heavy decks: the source slide render is retained as a visual underlay, while OCR text becomes hidden editable overlay text. The hidden text layer avoids visual double-rendering while preserving text for selection, search, and downstream editing. Use `--text-overlay visible` only for debugging OCR box placement. It is not yet a claim that every original shape is reconstructed as editable vector geometry.

Batch conversion is fail-soft per file: one deck failure is recorded in `batch-report.json` and does not prevent later decks from running. The command exits non-zero if any file fails.

LibreOffice conversions are retried up to 4 times by default. Inputs are staged to an ASCII filename before conversion because LibreOffice can be flaky with some Unicode or long path combinations on Windows. Keep verification output folders short, for example `runs/lo-check/f1`.

## Current Machine Snapshot

- LibreOffice: `C:\Program Files\LibreOffice\program\soffice.com`, version `LibreOffice 26.2.4.2`.
- OpenXML SDK generator: available through `.tools/dotnet/dotnet.exe`.
- PowerPoint COM: available for explicit final verification and native component copy/paste.
- Real PPT inventory: `ppt文档` has 6 PPTX files and 76 total slides.
- LibreOffice sample benchmark: `runs/openxml-sample-deck/deck.pptx` converted through LibreOffice + Poppler in about 8.9s total (`convertElapsedMs=5269`, `renderElapsedMs=3674`, one rendered page).
- Real PPTX 2-page LibreOffice benchmark: `ppt文档/PM_Portal_AI_Skills_Engine.pptx` has 12 slides; LibreOffice converted it to PDF in about 8.4s and Poppler rendered the first 2 pages in about 5.7s (`totalElapsedMs=14166`). The rendered PNGs were non-empty and no source files were modified.
- Real PPTX 12-page LibreOffice benchmark: the same deck rendered all 12 pages in about 37.9s (`convertElapsedMs=8496`, `renderElapsedMs=29380`); all 12 rendered PNGs were non-empty.
- Real PPTX 2-page editable overlay smoke: the same deck generated `runs/real-pptx-editable-2page-smoke-pm/PM_Portal_AI_Skills_Engine.editable.pptx` in about 14.2s, with 15 editable OCR text boxes over 2 pages. No files were written under `ppt文档/可编辑版本`.
- Real PPTX 12-page editable overlay smoke: the same deck generated `runs/real-pptx-editable-full-pm-lo-hidden/PM_Portal_AI_Skills_Engine.editable.pptx` in about 54.8s, with 110 hidden editable OCR text boxes over 12 pages.
- Generated PPTX verification: LibreOffice rendered that generated 12-page editable deck in about 34.7s (`convertElapsedMs=12400`, `renderElapsedMs=22248`); all 12 pages rendered and the first page no longer had OCR text double-rendering.
- Real PPTX 2-file staged batch: `AI_Powered_Product_Workflow_Transformation.pptx` and `AI_Product_Asset_OS.pptx` converted 4 selected pages in about 56.9s total, with 37 hidden editable OCR text boxes and 0 failed files.
- Staged generated PPTX verification: LibreOffice rendered `AI_Powered_Product_Workflow_Transformation.editable.pptx` first 2 pages in about 14.9s, confirming the generated deck remained readable.
- Full real PPTX conversion: all 6 files under `ppt文档` were converted to `ppt文档/可编辑版本` in about 7.4 minutes, with 76 output slides and 1226 hidden editable OCR text boxes. `batch-report.json` reported 6 converted files and 0 failed files.
- Full output inventory check: every generated `.editable.pptx` preserved the source slide count.
- Full output render spot-check: all 6 generated decks rendered their first page through LibreOffice in short verification folders under `runs/lo-check`, each producing a 1921x1080 PNG.

## Next Benchmark Gate

Before converting all real decks on a new machine, run one multi-file staged sample and compare:

- LibreOffice render time and page count.
- OCR hidden text overlay count and whether exported text boxes are usable.
- Visual drift on at least the first rendered page.
- No residual `soffice`, `POWERPNT`, or installer processes.
- No files written under `ppt文档/可编辑版本` until the staged sample is accepted.

Only if that staged sample is acceptable should the run expand to the whole 76-page directory.

## External References

- Microsoft: Office Automation is not recommended or supported for unattended, non-interactive automation because it can become unstable or deadlock.
- Microsoft Open XML SDK: supports programmatic manipulation and creation of PowerPoint PresentationML packages.
- LibreOffice Help: headless PDF export accepts command-line filter/options and is suitable for local conversion benchmarking.

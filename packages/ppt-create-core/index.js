"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { createPreviewHtml } = require("./editor");
const { materializeAssetPack, resolveAssetPack, sourceCompliance } = require("./assets");
const { createPrintableHtml, deckIrFingerprint, multiFormatQuality } = require("./export");
const { createDeckVariants } = require("./layout");
const { MAX_SPEC_BYTES, parsePresentationSpec } = require("./spec");
const { applyTemplateLayoutMap, materializeTemplate, resolveTemplate, templateRecord } = require("./template");
const { describeVariants, variantManifest, variantNames } = require("./variants");
const { validateGenerationManifest } = require("./prompt");

const CAPABILITY = "ppt-create";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_ppt_create_job", "get_ppt_create_report"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "ppt-create" });
const PPTX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PDF_MEDIA_TYPE = "application/pdf";
const ARTIFACT_NAMES = Object.freeze({ ir: "deck.ir.json", preview: "deck.preview.html", html: "deck.html", pptx: "deck.pptx", pdf: "deck.pdf", assetManifest: "asset-manifest.json", templateManifest: "template-manifest.json", generationManifest: "generation-manifest.json", generatedSpec: "presentation.generated.json", variants: "deck.variants.json", json: "ppt-create-report.json", markdown: "ppt-create-report.md" });

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertInputFile(workspaceRoot, input) {
  const file = insideRoot(workspaceRoot, input);
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_SPEC_BYTES || path.extname(file).toLowerCase() !== ".json") throw new Error("ppt-create input must be a bounded, non-symbolic JSON file");
  return file;
}
function assertNewOutput(workspaceRoot, output) {
  const directory = insideRoot(workspaceRoot, output);
  if (fs.existsSync(directory)) throw new Error("ppt-create output directory must not already exist");
  const parent = path.dirname(directory);
  const approvedParent = insideRoot(workspaceRoot, parent);
  if (!fs.existsSync(approvedParent) || !fs.statSync(approvedParent).isDirectory()) throw new Error("ppt-create output parent directory is unavailable");
  return directory;
}
function createPptCreateJob({ workspaceRoot, stateRoot, ownerId, input, output, idempotencyKey, generationManifest }) {
  const approvedInput = assertInputFile(workspaceRoot, input);
  const approvedOutput = assertNewOutput(workspaceRoot, output);
  const inputBuffer = fs.readFileSync(approvedInput);
  const spec = parsePresentationSpec(inputBuffer); const assets = resolveAssetPack(approvedInput, spec.assets || []); const template = resolveTemplate(approvedInput, spec.template);
  const inputSha256 = sha256(inputBuffer);
  const key = idempotencyKey || sha256(Buffer.from(`${inputSha256}\u0000${approvedOutput}`, "utf8"));
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  const generation = generationManifest === undefined ? undefined : validateGenerationManifest(generationManifest);
  if (!job.input) store.write({ ...job, input: { path: approvedInput, sha256: inputSha256, assets: assets.map((asset) => ({ id: asset.id, sha256: asset.sha256 })), ...(template ? { template: { sha256: template.sha256 } } : {}), ...(generation ? { generation } : {}) }, output: { path: approvedOutput } });
  return store.get(job.id);
}
function qualityFor(spec, ir, formats, assetRecords = [], template, variants = []) {
  const deliveredVariants = variants.length ? variants : [Object.freeze({ layoutIds: ir.pages.map((page) => page.intent?.layoutId), formats })];
  const editableObjects = ir.pages.reduce((total, page) => total + page.textBoxes.length + page.shapes.length + page.tables.length + page.charts.length, 0);
  const requiredFacts = spec.slides.reduce((total, slide) => total + slide.items.filter((item) => item.required).length, 0);
  const renderedFacts = spec.slides.reduce((total, slide) => total + slide.items.length, 0);
  const candidateLayouts = ir.pages.reduce((total, page) => total + (Array.isArray(page.intent?.candidateLayoutIds) ? page.intent.candidateLayoutIds.length : 0), 0);
  const selectedLayoutsResolved = ir.pages.every((page) => typeof page.intent?.layoutId === "string" && page.intent.candidateLayoutIds?.includes(page.intent.layoutId));
  const layoutCandidatesAvailable = ir.pages.every((page) => Array.isArray(page.intent?.candidateLayoutIds) && page.intent.candidateLayoutIds.length >= 2);
  const visualSlides = spec.slides.filter((slide) => slide.visual);
  const resolvedVisuals = ir.pages.reduce((total, page) => total + page.tables.length + page.charts.length + page.shapes.filter((item) => /-(?:media-slot|media-stage|analysis|node)$/u.test(item.id)).length, 0);
  const nativeTables = ir.pages.reduce((total, page) => total + page.tables.length, 0);
  const nativeCharts = ir.pages.reduce((total, page) => total + page.charts.filter((chart) => chart.nativePayload?.dataVerified === true).length, 0);
  const semanticAnalysisSlides = spec.slides.filter((slide) => slide.visual?.kind === "analysis").length;
  const semanticComponentPlans = ir.pages.reduce((total, page) => total + (page.semanticComponents?.length || 0), 0);
  const mediaSlots = spec.slides.filter((slide) => slide.visual?.kind === "media").length;
  const rasterImages = ir.pages.reduce((total, page) => total + page.images.length, 0);
  const declaredAssets = spec.assets || [];
  const citationCount = spec.slides.reduce((total, slide) => total + (slide.citations?.length || 0), 0);
  const notePageCount = spec.slides.filter((slide) => slide.speakerNotes || slide.citations?.length).length;
  const validPlaceholderCollections = new Set(["textBoxes", "images", "tables", "charts"]);
  const placeholderTypesByCollection = Object.freeze({ textBoxes: new Set(["title", "ctrTitle", "subTitle", "body", "obj"]), images: new Set(["pic", "obj"]), tables: new Set(["tbl", "obj"]), charts: new Set(["chart", "obj"]) });
  const placeholderBindingsValid = ir.pages.every((page) => {
    const bindings = page.intent?.templatePlaceholderBindings;
    if (!Array.isArray(bindings)) return false;
    if (page.intent?.templateLayoutMode === "freeform") return bindings.length === 0;
    const selectedLayout = template?.layoutMap?.find((layout) => layout.id === page.intent?.templateLayoutId);
    if (!selectedLayout) return false;
    const objectKeys = new Set(); const placeholderKeys = new Set();
    for (const binding of bindings) {
      if (!binding || !validPlaceholderCollections.has(binding.collection) || typeof binding.objectId !== "string" || !binding.objectId || typeof binding.placeholderType !== "string" || !placeholderTypesByCollection[binding.collection].has(binding.placeholderType) || !Number.isSafeInteger(binding.placeholderIndex) || binding.placeholderIndex < 0) return false;
      if (!selectedLayout.placeholders.some((placeholder) => placeholder.type === binding.placeholderType && placeholder.index === binding.placeholderIndex)) return false;
      const objects = page[binding.collection];
      if (!Array.isArray(objects) || !objects.some((item) => item.id === binding.objectId)) return false;
      const objectKey = `${binding.collection}:${binding.objectId}`; const placeholderKey = `${binding.placeholderType}:${binding.placeholderIndex}`;
      if (objectKeys.has(objectKey) || placeholderKeys.has(placeholderKey)) return false;
      objectKeys.add(objectKey); placeholderKeys.add(placeholderKey);
    }
    const nativeDemand = (page.tables?.length || 0) + (page.charts?.length || 0) + (page.images?.length || 0);
    const hasBodyText = (page.textBoxes || []).some((item) => !["title", "page-number", "section-number", "citation"].includes(item.role));
    const boundContent = bindings.filter((binding) => !["title", "ctrTitle"].includes(binding.placeholderType)).length;
    return page.intent?.templateLayoutFit !== "fit" || boundContent >= nativeDemand + (hasBodyText ? 1 : 0);
  });
  const checks = [
    { name: "presentation-spec-valid", passed: true },
    { name: "required-facts-covered", passed: renderedFacts >= requiredFacts },
    { name: "editable-content-present", passed: editableObjects > 0 },
    { name: "slide-count-matches", passed: ir.pages.length === spec.slides.length },
    { name: "layout-candidates-available", passed: layoutCandidatesAvailable },
    { name: "layout-selection-resolved", passed: selectedLayoutsResolved },
    { name: "semantic-visuals-resolved", passed: resolvedVisuals >= visualSlides.length },
    { name: "semantic-component-plan-resolved", passed: semanticComponentPlans === semanticAnalysisSlides },
    { name: "native-data-editable", passed: nativeTables === visualSlides.filter((slide) => slide.visual?.kind === "table").length && nativeCharts === visualSlides.filter((slide) => slide.visual?.kind === "chart").length },
    { name: "declared-assets-resolved", passed: declaredAssets.length === rasterImages && assetRecords.length === declaredAssets.length },
    { name: "asset-provenance-recorded", passed: assetRecords.every((asset) => asset.source && typeof asset.source.kind === "string" && /^[a-f0-9]{64}$/u.test(asset.sha256)) },
    { name: "asset-license-policy-compliant", passed: assetRecords.every((asset) => asset.compliance?.verified === true) },
    { name: "template-admission", passed: !spec.template || (template?.sha256 === spec.template.sha256 && template.mode === "master-and-theme") },
    { name: "template-provenance-recorded", passed: !spec.template || Boolean(template?.source?.kind && template?.source?.license) },
    { name: "template-license-policy-compliant", passed: !spec.template || sourceCompliance(template.source).verified },
    { name: "template-semantic-layout-mapped", passed: !spec.template || (template?.layoutMap?.length > 0 && ir.pages.every((page) => typeof page.intent?.templateLayoutId === "string")) },
    { name: "template-layout-capacity-respected", passed: !spec.template || ir.pages.every((page) => page.intent?.templateLayoutFit === "fit") },
    { name: "template-placeholder-bindings-recorded", passed: !spec.template || placeholderBindingsValid },
    { name: "deck-variants-generated", passed: deliveredVariants.length === spec.deckVariantCount },
    { name: "deck-variants-distinct", passed: new Set(deliveredVariants.map((variant) => variant.layoutIds.join("\u0000"))).size === deliveredVariants.length },
    { name: "deck-variant-formats-consistent", passed: deliveredVariants.every((variant) => variant.formats?.passed === true) },
    { name: "citations-rendered-editably", passed: ir.pages.filter((page) => page.textBoxes.some((item) => item.role === "citation")).length === spec.slides.filter((slide) => slide.citations?.length).length },
    { name: "speaker-notes-preserved", passed: ir.pages.filter((page) => typeof page.speakerNotes === "string" && page.speakerNotes.length > 0).length === notePageCount },
    ...(formats?.checks || [])
  ];
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: { pages: ir.pages.length, "required-facts": requiredFacts, "rendered-facts": renderedFacts, "editable-objects": editableObjects, "candidate-layouts": candidateLayouts, "deck-variants": deliveredVariants.length, citations: citationCount, "speaker-notes": notePageCount, "semantic-visuals": visualSlides.length, "native-tables": nativeTables, "native-charts": nativeCharts, "media-slots": mediaSlots, "declared-assets": declaredAssets.length, "raster-images": rasterImages } });
}
function creationReport(spec, quality, inputSha256, pptxSha256, formats, template, variants = []) {
  return Object.freeze({
    version: "1.0",
    capability: CAPABILITY,
    generatedAt: new Date().toISOString(),
    source: Object.freeze({ sha256: inputSha256 }),
    result: Object.freeze({ theme: spec.theme, pageCount: spec.slides.length, pptxSha256, deckVariantCount: variants.length || 1, ...(formats ? { sourceFingerprint: formats.fingerprint, pdfPageCount: formats.pdfPageCount } : {}), ...(template ? { template: Object.freeze({ mode: template.mode, sha256: template.sha256 }) } : {}), ...(variants.length > 1 ? { variants: Object.freeze(variants.map((variant) => Object.freeze({ id: variant.id, fingerprint: variant.fingerprint }))) } : {}) }),
    quality
  });
}
function renderMarkdown(report) {
  const status = report.quality.passed ? "passed" : "failed";
  return `# PPT Create Report\n\n- Status: ${status}\n- Theme: ${report.result.theme}\n- Pages: ${report.result.pageCount}\n- Deck variants: ${report.quality.metrics["deck-variants"]}\n- Citations: ${report.quality.metrics.citations}\n- Speaker notes: ${report.quality.metrics["speaker-notes"]}\n- Editable objects: ${report.quality.metrics["editable-objects"]}\n- Raster images: ${report.quality.metrics["raster-images"]}\n`;
}
function writeExclusive(file, value) { fs.writeFileSync(file, value, { flag: "wx", mode: 0o600 }); }
function artifact(file, name, mediaType) { return Object.freeze({ name, mediaType, uri: file, sha256: sha256File(file) }); }
function runPptCreateJob({ stateRoot, ownerId, id, buildPptx, buildPdf }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.capability !== CAPABILITY || job.status !== "queued" || !job.input?.path || !job.input?.sha256 || !job.output?.path) throw new Error("ppt-create job is incomplete");
  if (typeof buildPptx !== "function") throw new TypeError("ppt-create requires an OpenXML build adapter");
  if (typeof buildPdf !== "function") throw new TypeError("ppt-create requires a PDF build adapter");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  const output = job.output.path;
  try {
    const input = fs.readFileSync(job.input.path);
    if (sha256(input) !== job.input.sha256) throw new Error("presentation spec changed after job creation");
    const spec = parsePresentationSpec(input); const resolvedAssets = resolveAssetPack(job.input.path, spec.assets || []); const resolvedTemplate = resolveTemplate(job.input.path, spec.template);
    if (JSON.stringify(resolvedAssets.map((asset) => ({ id: asset.id, sha256: asset.sha256 }))) !== JSON.stringify(job.input.assets || [])) throw new Error("presentation asset pack changed after job creation");
    if ((resolvedTemplate?.sha256 || null) !== (job.input.template?.sha256 || null)) throw new Error("presentation template changed after job creation");
    fs.mkdirSync(output, { recursive: false });
    const assetPack = materializeAssetPack(resolvedAssets, output); const materializedTemplate = materializeTemplate(resolvedTemplate, output); const assetInfo = Object.fromEntries(assetPack.records.map((asset) => [asset.id, asset])); const deckVariants = createDeckVariants(spec, { assetPaths: assetPack.paths, assetInfo }).map((variant) => Object.freeze({ ...variant, ir: applyTemplateLayoutMap(variant.ir, resolvedTemplate) })); const variantRecords = describeVariants(deckVariants);
    const assetManifestFile = path.join(output, ARTIFACT_NAMES.assetManifest);
    const templateManifestFile = resolvedTemplate ? path.join(output, ARTIFACT_NAMES.templateManifest) : undefined;
    const variantsManifestFile = deckVariants.length > 1 ? path.join(output, ARTIFACT_NAMES.variants) : undefined;
    const generationManifestFile = job.input.generation ? path.join(output, ARTIFACT_NAMES.generationManifest) : undefined;
    const generatedSpecFile = job.input.generation ? path.join(output, ARTIFACT_NAMES.generatedSpec) : undefined;
    writeExclusive(assetManifestFile, `${JSON.stringify({ version: "1.0", assets: assetPack.records }, null, 2)}\n`);
    if (templateManifestFile) writeExclusive(templateManifestFile, `${JSON.stringify({ version: "1.0", template: templateRecord(resolvedTemplate) }, null, 2)}\n`);
    if (generationManifestFile) writeExclusive(generationManifestFile, `${JSON.stringify(job.input.generation, null, 2)}\n`);
    if (generatedSpecFile) writeExclusive(generatedSpecFile, input);
    const deliveries = [];
    for (const variant of deckVariants) {
      const names = variantNames(variant.variantIndex); const files = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, path.join(output, name)]));
      writeExclusive(files.ir, `${JSON.stringify(variant.ir, null, 2)}\n`); writeExclusive(files.preview, createPreviewHtml(spec, variant.ir)); writeExclusive(files.html, createPrintableHtml(variant.ir, { assetRoot: output }));
      buildPptx(Object.freeze({ irFile: files.ir, outFile: files.pptx, ...(materializedTemplate ? { templatePptx: materializedTemplate } : {}) }));
      const pptxInfo = fs.lstatSync(files.pptx); if (!pptxInfo.isFile() || pptxInfo.isSymbolicLink() || pptxInfo.size < 22) throw new Error("OpenXML builder did not create a valid PPTX artifact");
      const sourceFingerprint = deckIrFingerprint(variant.ir); const pdfResult = buildPdf(Object.freeze({ pptxFile: files.pptx, htmlFile: files.html, outFile: files.pdf, sourceFingerprint, pageCount: variant.ir.pages.length })); const formats = multiFormatQuality(variant.ir, { htmlFile: files.html, pptxFile: files.pptx, pdfFile: files.pdf }, pdfResult);
      deliveries.push(Object.freeze({ ...variantRecords[variant.variantIndex], formats, files, names }));
    }
    if (materializedTemplate) fs.rmSync(materializedTemplate, { force: true });
    if (variantsManifestFile) writeExclusive(variantsManifestFile, `${JSON.stringify(variantManifest(variantRecords), null, 2)}\n`);
    const primary = deliveries[0]; const ir = deckVariants[0].ir; const quality = qualityFor(spec, ir, primary.formats, assetPack.records, resolvedTemplate, deliveries);
    if (!quality.passed) throw new Error("multi-format consistency gate failed");
    const report = creationReport(spec, quality, job.input.sha256, sha256File(primary.files.pptx), primary.formats, resolvedTemplate, deliveries);
    const reportFile = path.join(output, ARTIFACT_NAMES.json);
    const markdownFile = path.join(output, ARTIFACT_NAMES.markdown);
    writeExclusive(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    writeExclusive(markdownFile, renderMarkdown(report));
    const artifacts = [...deliveries.flatMap((delivery) => [artifact(delivery.files.ir, delivery.names.ir, "application/json"), artifact(delivery.files.preview, delivery.names.preview, "text/html"), artifact(delivery.files.html, delivery.names.html, "text/html"), artifact(delivery.files.pptx, delivery.names.pptx, PPTX_MEDIA_TYPE), artifact(delivery.files.pdf, delivery.names.pdf, PDF_MEDIA_TYPE)]), artifact(assetManifestFile, ARTIFACT_NAMES.assetManifest, "application/json"), ...(templateManifestFile ? [artifact(templateManifestFile, ARTIFACT_NAMES.templateManifest, "application/json")] : []), ...(generationManifestFile ? [artifact(generationManifestFile, ARTIFACT_NAMES.generationManifest, "application/json"), artifact(generatedSpecFile, ARTIFACT_NAMES.generatedSpec, "application/json")] : []), ...(variantsManifestFile ? [artifact(variantsManifestFile, ARTIFACT_NAMES.variants, "application/json")] : []), artifact(reportFile, ARTIFACT_NAMES.json, "application/json"), artifact(markdownFile, ARTIFACT_NAMES.markdown, "text/markdown")];
    return store.transition(id, "succeeded", { artifacts, quality, lease: undefined, ...(generatedSpecFile ? { input: { ...job.input, path: generatedSpecFile } } : {}) });
  } catch {
    try { fs.rmSync(output, { recursive: true, force: true, maxRetries: 2 }); } catch { /* preserve the original bounded failure */ }
    return store.transition(id, "failed", { error: { code: "PPT_CREATE_FAILED", message: "PPT creation failed", retryable: false }, lease: undefined });
  }
}
function pptCreateSummary(job, workspaceRoot) {
  try {
    if (!job || job.capability !== CAPABILITY || job.status !== "succeeded" || !job.output?.path) throw new Error("unavailable");
    const output = insideRoot(workspaceRoot, job.output.path);
    const reportFile = insideRoot(output, path.join(output, ARTIFACT_NAMES.json));
    const reportArtifact = job.artifacts.find((item) => item.name === ARTIFACT_NAMES.json && item.uri === reportFile && item.mediaType === "application/json");
    if (!reportArtifact || sha256File(reportFile) !== reportArtifact.sha256 || fs.statSync(reportFile).size > 256 * 1024) throw new Error("unavailable");
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    if (report?.capability !== CAPABILITY || !report.result || !Number.isSafeInteger(report.result.pageCount) || report.result.pageCount < 1 || report.result.pageCount > 100 || !Number.isSafeInteger(report.result.deckVariantCount) || report.result.deckVariantCount < 1 || report.result.deckVariantCount > 3 || typeof report.result.theme !== "string" || !/^[a-f0-9]{64}$/.test(report.result.pptxSha256 || "")) throw new Error("unavailable");
    return Object.freeze({ theme: report.result.theme, pageCount: report.result.pageCount, pptxSha256: report.result.pptxSha256 });
  } catch { return null; }
}

module.exports = { ARTIFACT_NAMES, CAPABILITY, PDF_MEDIA_TYPE, PPTX_MEDIA_TYPE, REGISTRATION, createPptCreateJob, creationReport, pptCreateSummary, qualityFor, renderMarkdown, runPptCreateJob };

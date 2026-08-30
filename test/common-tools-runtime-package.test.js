"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const packageManifest = require("../package.json");
const { IMAGE_EDITABLE_RELEASE_FILES, MAX_PACKAGE_BYTES, PPT_CREATE_RELEASE_FILES, REQUIRED_FILES, imageEditableEnhancementProbe, npmInvocation, parsePackMetadata, pptCreateEnhancementProbe, pptCreateLayoutProbe, runClassifiedProbe } = require("../scripts/verify-runtime-package");

function metadata(files = REQUIRED_FILES) {
  return JSON.stringify([{
    filename: `common-tools-${packageManifest.version}.tgz`,
    size: 1024,
    files: files.map((file) => ({ path: file, size: 1 }))
  }]);
}

test("runtime package verifier accepts a bounded release-only file manifest", () => {
  const result = parsePackMetadata(metadata([...REQUIRED_FILES, "README.md"]));
  assert.equal(result.filename, `common-tools-${packageManifest.version}.tgz`);
  assert.equal(result.size, 1024);
  assert.deepEqual(result.files, [...REQUIRED_FILES, "README.md"]);
});

test("runtime package verifier rejects missing, unsafe, duplicate, and oversized package metadata", () => {
  assert.throws(() => parsePackMetadata(metadata(REQUIRED_FILES.slice(1))), /missing a required file/);
  assert.throws(() => parsePackMetadata(metadata([...REQUIRED_FILES, "skills/pd-hifi-slideclone/examples/sample.json"])), /forbidden file/);
  assert.throws(() => parsePackMetadata(metadata([...REQUIRED_FILES, REQUIRED_FILES[0]])), /file list is invalid/);
  assert.throws(() => parsePackMetadata(JSON.stringify([{ filename: "../unsafe.tgz", size: 1, files: REQUIRED_FILES.map((file) => ({ path: file, size: 1 })) }])), /filename is invalid/);
  assert.throws(() => parsePackMetadata(JSON.stringify([{ filename: "common-tools.tgz", size: MAX_PACKAGE_BYTES + 1, files: REQUIRED_FILES.map((file) => ({ path: file, size: 1 })) }])), /size is invalid/);
});

test("runtime package verification is an explicit release and CI gate", () => {
  assert.equal(packageManifest.scripts["common-tools:verify-runtime-package"], "node scripts/verify-runtime-package.js");
  assert.match(packageManifest.scripts["verify:ci"], /common-tools:verify-runtime-package/);
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /Pack, install, and verify the release Runtime[\s\S]*npm run common-tools:verify-runtime-package/);
});

test("runtime package release gate retains and probes the image residual deduplication implementation", () => {
  for (const file of IMAGE_EDITABLE_RELEASE_FILES) assert.ok(REQUIRED_FILES.includes(file));
  const probe = imageEditableEnhancementProbe();
  for (const marker of ["residualEraseObjects", "residualDeduplicationStatus", "createEditableSourceArchive", "MAX_RAW_IMAGE_ARCHIVE_PAGES", "createTeamDocumentNormalizer", "MAX_DOCUMENT_PAGES", "createRawImageRenderQualityVerifier", "raw-image-batch-validated", "document-pages-normalized", "MAX_RAW_IMAGE_PAGES", "MAX_EDITABLE_BATCH_INPUTS", "editable batch", "editable-source-archive", "200,000,000 decoded pixels", "eraseObjectMask", "full-slide-object-erased-residual", "residual-native-duplicates-removed"]) assert.match(probe, new RegExp(marker));
  assert.match(probe, /remote-worker-wiring/);
});

test("runtime package release gate retains and probes the ppt-create layout candidate implementation", () => {
  for (const file of PPT_CREATE_RELEASE_FILES) assert.ok(REQUIRED_FILES.includes(file));
  const probe = pptCreateLayoutProbe();
  for (const marker of ["THEME_REGISTRY", "LAYOUT_REGISTRY", "createLayoutPlan", "candidate-bounds", "deterministic-plan", "schema-semantic-visuals", "planSemanticAnalysis", "semantic-component-plan", "semantic-component-plan-resolved", "native-chart-payload", "editor-preview", "editor-persistence", "deck.preview.html", "ppt apply-edit", "layout-candidates-available", "layout-selection-resolved", "semantic-visuals-resolved", "native-data-editable", "presentation-brief.schema.json", "planPresentation", "brief-planning", "planning-source-covered", "ppt plan"]) assert.match(probe, new RegExp(marker));
});

test("runtime package release gate retains and functionally probes the complete ppt-create enhancement set", () => {
  for (const file of ["packages/ppt-create-core/assets.js", "packages/ppt-create-core/image-delivery.js", "packages/ppt-create-core/ir-editor.js", "packages/ppt-create-core/ir-editor-session.js", "packages/ppt-create-core/ir-lifecycle.js", "packages/ppt-create-core/semantic-components.js", "packages/ppt-create-core/document-ingest.js", "packages/ppt-create-core/pdf-text.js", "packages/ppt-create-core/template.js", "packages/ppt-create-core/variants.js", "packages/ppt-create-core/content-metadata.js", "packages/ppt-create-core/content-provider.js", "packages/ppt-create-core/team-worker.js", "packages/ppt-create-core/team-archive.js", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/DeckPackageWriter.cs", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/PptxPackageAdmissionValidator.cs", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/SpeakerNotesWriter.cs"]) assert.ok(PPT_CREATE_RELEASE_FILES.includes(file));
  const probe = pptCreateEnhancementProbe();
  for (const marker of ["controlled-semantic-editor", "showModal", "openTableEditor", "openChartEditor"]) assert.match(probe, new RegExp(marker));
  for (const marker of ["asset-provenance", "createImageDeliveryArtifacts", "applyAndExportIrArtifacts", "applyIrEditorPatch", "startIrEditorSession", "set-table-cell", "set-chart-data", "applyObjectLifecycleOperation", "applyPageLifecycleOperation", "exportEditedIrArtifacts", "edit-finalization-report.json", "realpathSync.native", "extractMarkdownOutline", "promptToPresentation", "promptToPresentationAsync", "ContentProviderError", "MAX_PROVIDER_REQUEST_BYTES", "ContentProviderRegistry", "createHttpsJsonContentProvider", "loadContentProviderConfig", "persistPromptPlan", "persistPromptPlanAsync", "semantic-depth", "validateGenerationManifest", "applyTemplateLayoutMap", "extractPdfText", "extractPdfLayout", "generatedTemplateRejected", "createDeckVariants", "describeVariants", "composeSpeakerNotes", "createPptCreateHandler", "createPptCreateArchive", "admitPptCreateArchive", "deckVariantCount", "ValidateTemplate", "SpeakerNotesWriter.Add", "ppt edit-session", "loopback-editor-session-bound", "semantic-table-data-editable", "semantic-chart-data-editable", "ppt draft", "ppt compose", "--provider-config", "document-visual-structure-preserved", "template-semantic-layout-mapped", "template-layout-capacity-respected", "complex-graphic-native-gate", "ir-batch-style-validated", "ir-object-lifecycle-validated", "ir-page-lifecycle-validated", "ppt archive", "ppt apply-ir-edit", "ppt finalize-ir-edit", "ppt export-ir", "deck.variants.json", "asset-manifest.json", "generation-manifest.json", "asset-license-policy-compliant"]) assert.match(probe, new RegExp(marker.replaceAll(".", "\\.")));
});

test("classified Runtime probes expose only bounded safe failure codes", () => {
  assert.equal(runClassifiedProbe(() => ({ status: 0, stdout: "ready" }), [], process.cwd(), "probe failed"), "ready");
  assert.throws(
    () => runClassifiedProbe(() => ({ status: 2, stdout: "remote-worker-wiring" }), [], process.cwd(), "probe failed"),
    /probe failed \(remote-worker-wiring\)/
  );
  assert.throws(
    () => runClassifiedProbe(() => ({ status: 2, stdout: "secret=value\n" }), [], process.cwd(), "probe failed"),
    /probe failed \(unclassified\)/
  );
});

test("runtime package retains the Git marketplace required by installed plugin commands", () => {
  assert.ok(packageManifest.files.includes(".agents/"));
  assert.ok(REQUIRED_FILES.includes(".agents/plugins/marketplace.json"));
});

test("runtime package retains the release OCR evidence, doctor, and Keycloak remediation entrypoints", () => {
  for (const file of ["scripts/generate-image-ocr-release-input.js", "scripts/team-runtime-doctor.js", "scripts/team-keycloak-mcp-client-sync.ps1", "scripts/team-keycloak-recovery-admin.ps1"]) {
    assert.ok(packageManifest.files.includes(file));
    assert.ok(REQUIRED_FILES.includes(file));
  }
  assert.equal(packageManifest.scripts["common-tools:team-doctor"], "node scripts/team-runtime-doctor.js");
});

test("runtime package verifier invokes npm through the current Node installation without a shell", () => {
  const invocation = npmInvocation(["pack", "--json"]);
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.arguments.slice(1).join(" "), "pack --json");
  assert.match(invocation.arguments[0], /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
});

test("runtime package verifier resolves hosted Linux and direct Node npm layouts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-npm-layout-"));
  try {
    const hostedNode = path.join(root, "hosted", "bin", "node");
    const hostedCli = path.join(root, "hosted", "lib", "node_modules", "npm", "bin", "npm-cli.js");
    const directNode = path.join(root, "direct", "node.exe");
    const directCli = path.join(root, "direct", "node_modules", "npm", "bin", "npm-cli.js");
    for (const file of [hostedNode, hostedCli, directNode, directCli]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "probe\n");
    }
    assert.equal(npmInvocation(["pack"], { execPath: hostedNode, npmExecPath: undefined }).arguments[0], hostedCli);
    assert.equal(npmInvocation(["pack"], { execPath: directNode, npmExecPath: undefined }).arguments[0], directCli);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runtime package verifier rejects npm CLI paths outside the active Node installation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-npm-boundary-"));
  try {
    const node = path.join(root, "active", "bin", "node");
    const outsideCli = path.join(root, "outside", "node_modules", "npm", "bin", "npm-cli.js");
    fs.mkdirSync(path.dirname(node), { recursive: true });
    fs.mkdirSync(path.dirname(outsideCli), { recursive: true });
    fs.writeFileSync(node, "probe\n");
    fs.writeFileSync(outsideCli, "probe\n");
    assert.throws(() => npmInvocation(["pack"], { execPath: node, npmExecPath: outsideCli }), /Node npm CLI is unavailable/);
    assert.throws(() => npmInvocation(["pack"], { execPath: "relative-node", npmExecPath: outsideCli }), /Node executable path is invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

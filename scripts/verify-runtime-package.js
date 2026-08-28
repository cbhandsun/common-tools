#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024;
const IMAGE_EDITABLE_RELEASE_FILES = Object.freeze([
  "packages/capability-manifests/image-to-editable/capability.manifest.json",
  "packages/slideclone-core/team-native-rebuild.js",
  "packages/slideclone-core/team-worker.js",
  "packages/remote-mcp-server/bin/common-tools-team-image-worker.js",
  "skills/pd-hifi-slideclone/scripts/lib/full-slide-native-residual.js",
  "plugins/common-tools/skills/image-to-editable/SKILL.md"
]);
const PPT_CREATE_RELEASE_FILES = Object.freeze([
  "packages/capability-manifests/ppt-create/capability.manifest.json",
  "packages/ppt-create-core/index.js",
  "packages/ppt-create-core/spec.js",
  "packages/ppt-create-core/assets.js",
  "packages/ppt-create-core/image-delivery.js",
  "packages/ppt-create-core/ir-editor.js",
  "packages/ppt-create-core/ir-lifecycle.js",
  "packages/ppt-create-core/document-ingest.js",
  "packages/ppt-create-core/pdf-text.js",
  "packages/ppt-create-core/template.js",
  "packages/ppt-create-core/variants.js",
  "packages/ppt-create-core/content-metadata.js",
  "packages/ppt-create-core/content-provider.js",
  "packages/ppt-create-core/team-worker.js",
  "packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker.js",
  "deploy/compose.team-ppt-create-provider.yaml",
  "packages/ppt-create-core/team-archive.js",
  "packages/ppt-create-core/theme-registry.js",
  "packages/ppt-create-core/layout-registry.js",
  "packages/ppt-create-core/data-models.js",
  "packages/ppt-create-core/editor.js",
  "packages/ppt-create-core/export.js",
  "packages/ppt-create-core/libreoffice-pdf.js",
  "packages/ppt-create-core/planner.js",
  "packages/ppt-create-core/prompt.js",
  "packages/ppt-create-core/layout.js",
  "packages/ppt-create-core/presentation-brief.schema.json",
  "packages/ppt-create-core/presentation-spec.schema.json",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/DeckPackageWriter.cs",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/Models.cs",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/PptxPackageAdmissionValidator.cs",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/SpeakerNotesWriter.cs",
  "plugins/common-tools/skills/ppt-create/SKILL.md"
]);
const REQUIRED_FILES = Object.freeze([
  ".agents/plugins/marketplace.json",
  "package.json",
  "packages/cli/bin/common-tools.js",
  "packages/mcp-server/core.js",
  "scripts/generate-sbom.js",
  "scripts/release-evidence.js",
  "scripts/generate-image-ocr-release-input.js",
  "scripts/generate-remote-plugin-bundles.js",
  "scripts/common-tools-docker-engine.ps1",
  "scripts/team-runtime-compose-smoke.ps1",
  "scripts/team-runtime-local-deploy.ps1",
  "scripts/team-keycloak-mcp-client-sync.ps1",
  "scripts/team-keycloak-recovery-admin.ps1",
  "scripts/team-runtime-production-deploy.ps1",
  "scripts/team-runtime-operation-lock.ps1",
  "scripts/team-runtime-postgres-restore-drill.ps1",
  "scripts/team-runtime-object-store-restore-drill.ps1",
  "scripts/team-postgres-volume-backup.ps1",
  "scripts/team-keycloak-volume-backup.ps1",
  "scripts/team-keycloak-volume-restore-drill.ps1",
  "scripts/team-keycloak-persistence-migrate.ps1",
  "scripts/team-minio-volume-backup.ps1",
  "scripts/team-runtime-local-fresh-reset.ps1",
  "scripts/team-runtime-doctor.js",
  "skills/pd-hifi-slideclone/scripts/slideclone.js",
  "skills/pd-hifi-slideclone/schemas/slideclone.config.schema.json",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/OpenXmlDeckBuilder.csproj",
  ...IMAGE_EDITABLE_RELEASE_FILES,
  ...PPT_CREATE_RELEASE_FILES
]);
const FORBIDDEN_PREFIXES = Object.freeze([
  ".codex-tmp/",
  "node_modules/",
  "runs/",
  "test/",
  "skills/pd-hifi-slideclone/examples/",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/bin/",
  "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/obj/"
]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function normalFile(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || value.includes("../")) throw new Error(`${label} is invalid`);
  return value;
}

function parsePackMetadata(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error("npm pack returned invalid metadata"); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !plainObject(parsed[0])) throw new Error("npm pack returned invalid metadata");
  const metadata = parsed[0];
  const filename = normalFile(metadata.filename, "package filename");
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_PACKAGE_BYTES) throw new Error("runtime package size is invalid");
  if (!Array.isArray(metadata.files) || metadata.files.length === 0 || metadata.files.length > 5000) throw new Error("runtime package file list is invalid");
  const files = metadata.files.map((entry) => {
    if (!plainObject(entry) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error("runtime package file list is invalid");
    return normalFile(entry.path, "runtime package file");
  });
  if (new Set(files).size !== files.length) throw new Error("runtime package file list is invalid");
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error("runtime package is missing a required file");
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (files.some((file) => file.startsWith(prefix))) throw new Error("runtime package includes a forbidden file");
  }
  return Object.freeze({ filename, size: metadata.size, files: Object.freeze(files) });
}

function normalDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`${label} is invalid`);
  const details = fs.statSync(value);
  if (!details.isDirectory()) throw new Error(`${label} is invalid`);
  return value;
}

function run(commandRunner, command, argumentsList, cwd, failureMessage) {
  const result = commandRunner(command, argumentsList, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 5 * 60 * 1000,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES
  });
  if (!result || result.error || result.status !== 0 || typeof result.stdout !== "string") throw new Error(failureMessage);
  return result.stdout;
}
function runClassifiedProbe(commandRunner, argumentsList, cwd, failureMessage) {
  const result = commandRunner(process.execPath, argumentsList, { cwd, encoding: "utf8", windowsHide: true, shell: false, timeout: 60 * 1000, maxBuffer: 4096 });
  if (result && !result.error && result.status === 0 && result.stdout === "ready") return result.stdout;
  const code = typeof result?.stdout === "string" && /^[a-z-]{3,64}$/.test(result.stdout) ? result.stdout : "unclassified";
  throw new Error(`${failureMessage} (${code})`);
}

function npmCliPath() {
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  let details;
  try { details = fs.lstatSync(candidate); } catch { throw new Error("Node npm CLI is unavailable"); }
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("Node npm CLI is unavailable");
  return candidate;
}

function npmInvocation(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.some((value) => typeof value !== "string")) throw new TypeError("npm invocation is invalid");
  return Object.freeze({ command: process.execPath, arguments: Object.freeze([npmCliPath(), ...argumentsList]) });
}

function installedCliPath(installRoot) {
  const executable = process.platform === "win32" ? "common-tools.cmd" : "common-tools";
  const target = path.join(installRoot, "node_modules", ".bin", executable);
  const details = fs.lstatSync(target);
  if (!details.isFile() && !details.isSymbolicLink()) throw new Error("installed runtime CLI shim is missing");
  return path.join(installRoot, "node_modules", "common-tools", "packages", "cli", "bin", "common-tools.js");
}

function imageEditableEnhancementProbe() {
  return [
    "let stage='initialization';try{const fs=require('node:fs');const path=require('node:path');",
    "const root=path.resolve(process.argv[1]);",
    "stage='manifest-load';",
    "const manifest=require(path.join(root,'packages','capability-manifests','image-to-editable','capability.manifest.json'));",
    "const version=String(manifest.version||'').split('.').map(Number);",
    "stage='core-load';",
    "const native=require(path.join(root,'packages','slideclone-core','team-native-rebuild.js'));",
    "const worker=require(path.join(root,'packages','slideclone-core','team-worker.js'));",
    "const residual=require(path.join(root,'skills','pd-hifi-slideclone','scripts','lib','full-slide-native-residual.js'));",
    "stage='source-read';",
    "const nativeSource=fs.readFileSync(path.join(root,'packages','slideclone-core','team-native-rebuild.js'),'utf8');",
    "const workerSource=fs.readFileSync(path.join(root,'packages','slideclone-core','team-worker.js'),'utf8');",
    "const remoteSource=fs.readFileSync(path.join(root,'packages','remote-mcp-server','bin','common-tools-team-image-worker.js'),'utf8');",
    "const skill=fs.readFileSync(path.join(root,'plugins','common-tools','skills','image-to-editable','SKILL.md'),'utf8');",
    "const versionReady=version.length===3&&version.every(Number.isSafeInteger)&&(version[0]>0||version[1]>1||(version[1]===1&&version[2]>=4));",
    "const checks=[['capability-version',versionReady],['native-export',typeof native.residualEraseObjects==='function'],['worker-export',typeof worker.residualDeduplicationStatus==='function'],['residual-export',typeof residual.eraseObjectMask==='function'],['remote-worker-wiring',remoteSource.includes('createNativeRebuilder')&&remoteSource.includes('full-slide-native-residual')],['native-strategy',nativeSource.includes('full-slide-object-erased-residual')],['worker-quality-gate',workerSource.includes('residual-native-duplicates-removed')],['marketplace-skill-gate',skill.includes('residual-native-duplicates-removed')]];",
    "const failed=checks.find((entry)=>!entry[1]);if(failed){process.stdout.write(failed[0]);process.exit(2);}process.stdout.write('ready');",
    "}catch{process.stdout.write(stage);process.exit(2);}"
  ].join("");
}

function pptCreateLayoutProbe() {
  return [
    "let stage='initialization';try{const fs=require('node:fs');const path=require('node:path');",
    "const root=path.resolve(process.argv[1]);",
    "stage='manifest-load';const manifest=require(path.join(root,'packages','capability-manifests','ppt-create','capability.manifest.json'));",
    "const version=String(manifest.version||'').split('.').map(Number);",
    "stage='registry-load';const themes=require(path.join(root,'packages','ppt-create-core','theme-registry.js'));const layouts=require(path.join(root,'packages','ppt-create-core','layout-registry.js'));const models=require(path.join(root,'packages','ppt-create-core','data-models.js'));const editor=require(path.join(root,'packages','ppt-create-core','editor.js'));const exporter=require(path.join(root,'packages','ppt-create-core','export.js'));const pdf=require(path.join(root,'packages','ppt-create-core','libreoffice-pdf.js'));const briefPlanner=require(path.join(root,'packages','ppt-create-core','planner.js'));const layoutPlanner=require(path.join(root,'packages','ppt-create-core','layout.js'));const briefSchema=require(path.join(root,'packages','ppt-create-core','presentation-brief.schema.json'));const schema=require(path.join(root,'packages','ppt-create-core','presentation-spec.schema.json'));",
    "stage='source-read';const skill=fs.readFileSync(path.join(root,'plugins','common-tools','skills','ppt-create','SKILL.md'),'utf8');",
    "stage='plan';const input={version:'1.0',title:'Release probe',theme:'clean-light-v1',seed:'release-probe',variantCount:3,slides:[{id:'cover',role:'cover',title:'Release probe'}]};const first=layoutPlanner.createLayoutPlan(input);const second=layoutPlanner.createLayoutPlan(input);",
    "stage='data-model';const chart=models.normalizeVisual({kind:'chart',type:'column',categories:['A','B'],series:[{name:'Value',values:[1,2]}]},'probe chart');const payload=models.nativeChartPayload(chart,{barFill:'#175CD3'});",
    "stage='editor';const editorModel=editor.createEditorModel(input);const html=editor.createPreviewHtml(input,layoutPlanner.createDeckIr(input));const edited=editor.applyEditorPatch(input,{version:'1.0',expectedRevision:editorModel.revision,operations:[{type:'set-slide-text',slideId:'cover',field:'title',value:'Edited probe'}]});",
    "stage='formats';const deckIr=layoutPlanner.createDeckIr(input);const printable=exporter.createPrintableHtml(deckIr);const fingerprint=exporter.deckIrFingerprint(deckIr);",
    "stage='brief-plan';const planned=briefPlanner.planPresentation({version:'1.0',title:'Brief probe',audience:'Reviewers',purpose:'Approve direction',maxSlides:3,sections:[{id:'facts',title:'Facts',points:[{id:'fact',label:'Verified fact'}]}]});",
    "const versionReady=version.length===3&&version.every(Number.isSafeInteger)&&(version[0]>0||version[1]>1||(version[1]===1&&version[2]>=6));",
    "const candidates=first.pages&&first.pages[0]&&first.pages[0].candidates;",
    "const checks=[['capability-version',versionReady],['theme-registry',Array.isArray(themes.THEME_REGISTRY)&&themes.THEME_REGISTRY.length>=4],['layout-registry',Array.isArray(layouts.LAYOUT_REGISTRY)&&layouts.LAYOUT_REGISTRY.length>=22],['layout-export',typeof layoutPlanner.createLayoutPlan==='function'],['candidate-bounds',Array.isArray(candidates)&&candidates.length>=2&&candidates.length<=3],['deterministic-plan',JSON.stringify(first)===JSON.stringify(second)],['schema-variant-bound',schema.properties&&schema.properties.variantCount&&schema.properties.variantCount.maximum===3],['schema-semantic-visuals',schema.$defs&&schema.$defs.visual&&Array.isArray(schema.$defs.visual.oneOf)&&schema.$defs.visual.oneOf.length===4],['native-chart-payload',payload.dataVerified===true&&/^[a-f0-9]{64}$/.test(payload.fallbackSha256)],['editor-preview',html.includes('PPT Preview Editor')&&html.includes('presentation-edit.patch.json')],['editor-persistence',edited.spec.slides[0].title==='Edited probe'&&edited.revision!==editorModel.revision],['format-export',printable.includes(fingerprint)&&typeof pdf.buildPdfWithLibreOffice==='function'],['brief-schema',briefSchema.properties&&briefSchema.properties.maxSlides&&briefSchema.properties.maxSlides.maximum===100],['brief-planning',planned.report.passed===true&&planned.report.checks.some((check)=>check.name==='planning-source-covered')],['marketplace-skill-gate',skill.includes('layout-candidates-available')&&skill.includes('layout-selection-resolved')&&skill.includes('semantic-visuals-resolved')&&skill.includes('native-data-editable')&&skill.includes('deck.preview.html')&&skill.includes('ppt apply-edit')&&skill.includes('multi-format-page-count-matches')&&skill.includes('ppt plan')&&skill.includes('planning-source-covered')]];",
    "const failed=checks.find((entry)=>!entry[1]);if(failed){process.stdout.write(failed[0]);process.exit(2);}process.stdout.write('ready');",
    "}catch{process.stdout.write(stage);process.exit(2);}"
  ].join("");
}

function pptCreateEnhancementProbe() {
  return [
    "let stage='initialization';try{const fs=require('node:fs');const path=require('node:path');",
    "const root=path.resolve(process.argv[1]);",
    "stage='manifest-load';const manifest=require(path.join(root,'packages','capability-manifests','ppt-create','capability.manifest.json'));const version=String(manifest.version||'').split('.').map(Number);",
    "stage='module-load';const layout=require(path.join(root,'packages','ppt-create-core','layout.js'));const variants=require(path.join(root,'packages','ppt-create-core','variants.js'));const assets=require(path.join(root,'packages','ppt-create-core','assets.js'));const delivery=require(path.join(root,'packages','ppt-create-core','image-delivery.js'));const irEditor=require(path.join(root,'packages','ppt-create-core','ir-editor.js'));const irLifecycle=require(path.join(root,'packages','ppt-create-core','ir-lifecycle.js'));const ingest=require(path.join(root,'packages','ppt-create-core','document-ingest.js'));const prompt=require(path.join(root,'packages','ppt-create-core','prompt.js'));const contentProvider=require(path.join(root,'packages','ppt-create-core','content-provider.js'));const pdfText=require(path.join(root,'packages','ppt-create-core','pdf-text.js'));const template=require(path.join(root,'packages','ppt-create-core','template.js'));const metadata=require(path.join(root,'packages','ppt-create-core','content-metadata.js'));const worker=require(path.join(root,'packages','ppt-create-core','team-worker.js'));const teamArchive=require(path.join(root,'packages','ppt-create-core','team-archive.js'));const schema=require(path.join(root,'packages','ppt-create-core','presentation-spec.schema.json'));const briefSchema=require(path.join(root,'packages','ppt-create-core','presentation-brief.schema.json'));",
    "stage='asset-provenance';const assetManifest=assets.normalizeAssetManifest([{id:'hero',path:'assets/hero.png',sha256:'a'.repeat(64),source:{kind:'customer-provided',locator:'customer-upload',license:'customer-owned'}}]);",
    "stage='document-ingest';const outline=ingest.extractMarkdownOutline('# Probe\\n\\n## Facts\\n\\n- Verified point');const brief=ingest.outlineToBrief(outline,{audience:'Reviewers',purpose:'Approve direction',theme:'clean-light-v1',deckVariantCount:2,maxSlides:4});",
    "stage='template-safety';let generatedTemplateRejected=false;try{template.normalizeTemplate({path:'template.pptx',sha256:'b'.repeat(64),source:{kind:'generated',locator:'probe',license:'generated'},mode:'master-and-theme'});}catch{generatedTemplateRejected=true;}",
    "stage='variants';const spec={version:'1.0',title:'Enhancement probe',theme:'clean-light-v1',seed:'enhancement-probe',variantCount:2,deckVariantCount:2,slides:[{id:'cover',role:'cover',title:'Enhancement probe'},{id:'facts',role:'content',title:'Facts',items:[{id:'fact',label:'Verified point'}],citations:[{id:'source-1',title:'Primary source',locator:'https://example.com/source'}],speakerNotes:'Explain the verified point.'},{id:'close',role:'closing',title:'Next step'}]};const deckVariants=layout.createDeckVariants(spec);const variantRecords=variants.describeVariants(deckVariants);const notes=metadata.composeSpeakerNotes(spec.slides[1].speakerNotes,spec.slides[1].citations);",
    "stage='source-read';const skill=fs.readFileSync(path.join(root,'plugins','common-tools','skills','ppt-create','SKILL.md'),'utf8');const packageWriter=fs.readFileSync(path.join(root,'skills','pd-hifi-slideclone','dotnet','OpenXmlDeckBuilder','DeckPackageWriter.cs'),'utf8');const admission=fs.readFileSync(path.join(root,'skills','pd-hifi-slideclone','dotnet','OpenXmlDeckBuilder','PptxPackageAdmissionValidator.cs'),'utf8');const notesWriter=fs.readFileSync(path.join(root,'skills','pd-hifi-slideclone','dotnet','OpenXmlDeckBuilder','SpeakerNotesWriter.cs'),'utf8');",
    "const versionReady=version.length===3&&version.every(Number.isSafeInteger)&&(version[0]>0||version[1]>1||(version[1]===1&&version[2]>=10));",
    "const checks=[['capability-version',versionReady],['asset-provenance',assetManifest.length===1&&assetManifest[0].source.kind==='customer-provided'],['image-delivery',typeof delivery.createImageDeliveryArtifacts==='function'&&typeof delivery.createPreservationPlan==='function'],['ir-editor',typeof irEditor.applyIrEditorPatch==='function'&&typeof irEditor.createIrPreviewHtml==='function'&&typeof irEditor.exportEditedIrArtifacts==='function'],['ir-lifecycle',typeof irLifecycle.applyObjectLifecycleOperation==='function'],['document-ingest',brief.deckVariantCount===2&&brief.sections.length===1&&typeof pdfText.extractPdfLayout==='function'&&typeof pdfText.extractPdfText==='function'],['prompt-compose',typeof prompt.promptToPresentation==='function'&&typeof prompt.promptToPresentationAsync==='function'&&typeof prompt.persistPromptPlan==='function'&&typeof prompt.validateGenerationManifest==='function'],['content-provider',typeof contentProvider.ContentProviderRegistry==='function'&&typeof contentProvider.createHttpsJsonContentProvider==='function'],['template-safety',generatedTemplateRejected&&typeof template.inspectTemplate==='function'&&typeof template.applyTemplateLayoutMap==='function'],['deck-variants',deckVariants.length===2&&variantRecords.length===2],['citations-notes',notes.includes('Explain the verified point.')&&notes.includes('https://example.com/source')],['team-worker',typeof worker.createPptCreateHandler==='function'],['team-archive',typeof teamArchive.createPptCreateArchive==='function'&&typeof teamArchive.admitPptCreateArchive==='function'],['spec-schema',schema.properties&&schema.properties.deckVariantCount&&schema.properties.template&&schema.$defs&&schema.$defs.citation&&schema.$defs.slide.properties.speakerNotes],['brief-schema',briefSchema.properties&&briefSchema.properties.deckVariantCount],['openxml-template',admission.includes('ValidateTemplate')&&packageWriter.includes('ResolvePageLayout')],['openxml-notes',notesWriter.includes('class SpeakerNotesWriter')&&packageWriter.includes('SpeakerNotesWriter.Add')],['marketplace-skill',skill.includes('ppt draft')&&skill.includes('ppt compose')&&skill.includes('document-visual-structure-preserved')&&skill.includes('template-semantic-layout-mapped')&&skill.includes('complex-graphic-native-gate')&&skill.includes('ir-batch-style-validated')&&skill.includes('ir-object-lifecycle-validated')&&skill.includes('ppt archive')&&skill.includes('ppt apply-ir-edit')&&skill.includes('ppt export-ir')&&skill.includes('deck.variants.json')&&skill.includes('asset-manifest.json')&&skill.includes('generation-manifest.json')&&skill.includes('asset-license-policy-compliant')&&skill.includes('template-layout-capacity-respected')]];",
    "const failed=checks.find((entry)=>!entry[1]);if(failed){process.stdout.write(failed[0]);process.exit(2);}process.stdout.write('ready');",
    "}catch{process.stdout.write(stage);process.exit(2);}"
  ].join("");
}

function verifyInstalledCli({ installRoot, commandRunner }) {
  const cli = installedCliPath(installRoot);
  const packageRoot = path.join(installRoot, "node_modules", "common-tools");
  const help = run(commandRunner, process.execPath, [cli, "help"], installRoot, "installed runtime CLI help check failed");
  if (!help.includes("usage: common-tools <command>")) throw new Error("installed runtime CLI help is invalid");
  const listed = run(commandRunner, process.execPath, [cli, "plugin", "list"], installRoot, "installed runtime plugin check failed");
  let catalog;
  try { catalog = JSON.parse(listed); } catch { throw new Error("installed runtime plugin output is invalid"); }
  if (!plainObject(catalog) || catalog.distributionVerified !== true || !Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) throw new Error("installed runtime plugin output is invalid");
  const probe = "const path=require('node:path');const root=path.resolve(process.argv[1]);const api=require(path.join(root,'packages','cli','slideclone-runner.js'));const result=api.inspectBundledSlideclone({repositoryRoot:root});if(!result.available)process.exit(2);process.stdout.write('ready');";
  const imageEngine = run(commandRunner, process.execPath, ["-e", probe, packageRoot], installRoot, "installed image-to-editable engine check failed");
  if (imageEngine !== "ready") throw new Error("installed image-to-editable engine check failed");
  const remoteWorker = path.join(packageRoot, "packages", "remote-mcp-server", "bin", "common-tools-team-image-worker.js");
  run(commandRunner, process.execPath, ["--check", remoteWorker], installRoot, "installed image-to-editable remote worker syntax check failed");
  runClassifiedProbe(commandRunner, ["-e", imageEditableEnhancementProbe(), packageRoot], installRoot, "installed image-to-editable residual deduplication check failed");
  runClassifiedProbe(commandRunner, ["-e", pptCreateLayoutProbe(), packageRoot], installRoot, "installed ppt-create layout candidate check failed");
  runClassifiedProbe(commandRunner, ["-e", pptCreateEnhancementProbe(), packageRoot], installRoot, "installed ppt-create enhancement check failed");
  return Object.freeze({ capabilityCount: catalog.capabilities.length, imageToEditableEngine: true, residualDeduplication: true, pptCreateLayoutCandidates: true, pptCreatePlanning: true, pptCreateEnhancements: true });
}

function verifyRuntimePackage({ repositoryRoot = path.resolve(__dirname, ".."), commandRunner = childProcess.spawnSync, temporaryDirectory = fs.mkdtempSync } = {}) {
  if (typeof commandRunner !== "function" || typeof temporaryDirectory !== "function") throw new TypeError("runtime package verifier options are invalid");
  const root = normalDirectory(repositoryRoot, "repository root");
  const temporaryRoot = temporaryDirectory(path.join(os.tmpdir(), "common-tools-runtime-package-"));
  let cleanable = false;
  try {
    const temporaryDetails = fs.lstatSync(temporaryRoot);
    if (!temporaryDetails.isDirectory() || temporaryDetails.isSymbolicLink()) throw new Error("runtime package temporary directory is invalid");
    cleanable = true;
    const packInvocation = npmInvocation(["pack", "--json", "--pack-destination", temporaryRoot]);
    const packed = parsePackMetadata(run(commandRunner, packInvocation.command, packInvocation.arguments, root, "runtime package build failed"));
    const tarball = path.join(temporaryRoot, packed.filename);
    const tarballDetails = fs.lstatSync(tarball);
    if (!tarballDetails.isFile() || tarballDetails.isSymbolicLink() || tarballDetails.size !== packed.size) throw new Error("runtime package archive is invalid");
    const installRoot = path.join(temporaryRoot, "install");
    fs.mkdirSync(installRoot, { recursive: true, mode: 0o700 });
    const installInvocation = npmInvocation(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, tarball]);
    run(commandRunner, installInvocation.command, installInvocation.arguments, root, "runtime package installation failed");
    const installed = verifyInstalledCli({ installRoot, commandRunner });
    return Object.freeze({ packedBytes: packed.size, fileCount: packed.files.length, capabilityCount: installed.capabilityCount, imageToEditableEngine: installed.imageToEditableEngine, residualDeduplication: installed.residualDeduplication, pptCreateLayoutCandidates: installed.pptCreateLayoutCandidates, pptCreatePlanning: installed.pptCreatePlanning, pptCreateEnhancements: installed.pptCreateEnhancements });
  } finally {
    if (cleanable) fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

if (require.main === module) {
  const result = verifyRuntimePackage();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = { FORBIDDEN_PREFIXES, IMAGE_EDITABLE_RELEASE_FILES, MAX_PACKAGE_BYTES, PPT_CREATE_RELEASE_FILES, REQUIRED_FILES, imageEditableEnhancementProbe, installedCliPath, npmCliPath, npmInvocation, parsePackMetadata, pptCreateEnhancementProbe, pptCreateLayoutProbe, runClassifiedProbe, verifyInstalledCli, verifyRuntimePackage };

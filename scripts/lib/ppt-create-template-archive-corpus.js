"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createDeckIr } = require("../../packages/ppt-create-core/layout");
const { validatePresentationSpec } = require("../../packages/ppt-create-core/spec");
const { inspectPptx } = require("../../packages/ppt-create-core/export");
const { admitPptCreateArchive, createPptCreateArchive } = require("../../packages/ppt-create-core/team-archive");
const { applyTemplateLayoutMap } = require("../../packages/ppt-create-core/template");
const { extractEntry, readCentralDirectory } = require("../../packages/ppt-quality-core");
const { buildPptCreateUserTemplateArchiveSpec } = require("./ppt-create-office-corpus");

function packagePartSha256(file, partName) {
  const bytes = fs.readFileSync(file); const entry = readCentralDirectory(bytes).get(partName);
  if (!entry) throw new Error(`PPT creation template part is missing: ${partName}`);
  return crypto.createHash("sha256").update(extractEntry(bytes, entry)).digest("hex");
}

async function buildUserTemplateArchiveCase(corpusRoot, templateSourceFile, adapters = {}) {
  if (typeof corpusRoot !== "string" || !path.isAbsolute(corpusRoot) || !fs.statSync(corpusRoot, { throwIfNoEntry: false })?.isDirectory()) throw new TypeError("PPT creation template corpus root is unavailable");
  if (typeof templateSourceFile !== "string" || !path.isAbsolute(templateSourceFile) || !fs.statSync(templateSourceFile, { throwIfNoEntry: false })?.isFile()) throw new TypeError("PPT creation template corpus source is unavailable");
  if (typeof adapters.buildPptx !== "function" || typeof adapters.renderLibreOffice !== "function") throw new TypeError("PPT creation template corpus adapters are unavailable");
  const inputRoot = path.join(corpusRoot, "user-template-archive-input"); const templateDirectory = path.join(inputRoot, "templates");
  fs.mkdirSync(templateDirectory, { recursive: true });
  const templateFile = path.join(templateDirectory, "user-template.pptx"); fs.copyFileSync(templateSourceFile, templateFile, fs.constants.COPYFILE_EXCL);
  const spec = validatePresentationSpec(buildPptCreateUserTemplateArchiveSpec(templateFile)); const specFile = path.join(inputRoot, "presentation.json");
  fs.writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const archiveFile = path.join(corpusRoot, "user-template.archive.tar.gz"); const created = createPptCreateArchive({ specFile, outputFile: archiveFile });
  const admittedRoot = path.join(corpusRoot, "user-template-admitted"); fs.mkdirSync(admittedRoot);
  const admitted = admitPptCreateArchive(fs.readFileSync(archiveFile), admittedRoot);
  if (!admitted.template || admitted.manifest.files.filter((entry) => entry.role === "template").length !== 1) throw new Error("PPT creation user template archive admission failed");
  const deckRoot = path.join(corpusRoot, "user-template-result"); fs.mkdirSync(deckRoot);
  const ir = applyTemplateLayoutMap(createDeckIr(admitted.spec), admitted.template); const irFile = path.join(deckRoot, "user-template.ir.json"); const pptxFile = path.join(deckRoot, "user-template.pptx");
  if (ir.pages.some((page) => !page.intent?.templateLayoutId)) throw new Error("PPT creation user template semantic layout mapping failed");
  fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 }); adapters.buildPptx({ irFile, outFile: pptxFile, templatePptx: admitted.template.file }); inspectPptx(pptxFile);
  const masterPart = "ppt/slideMasters/slideMaster1.xml"; const masterPreserved = packagePartSha256(admitted.template.file, masterPart) === packagePartSha256(pptxFile, masterPart);
  if (!masterPreserved) throw new Error("PPT creation user template master was not preserved");
  const libreOffice = await adapters.renderLibreOffice({ pptx: { pptxFile }, iteration: 0 }, { outputDir: deckRoot, config: { render: { maxPages: admitted.spec.slides.length } } });
  if (!libreOffice.ok || libreOffice.renderedPageCount !== admitted.spec.slides.length) throw new Error("PPT creation user template LibreOffice validation failed");
  return Object.freeze({
    deck: Object.freeze({ id: "user-template-archive", pptxFile, pageCount: admitted.spec.slides.length, theme: admitted.spec.theme, language: admitted.spec.language, layouts: admitted.spec.slides.map((slide) => slide.layout) }),
    report: Object.freeze({ archiveCreated: created.template === true, archiveAdmitted: true, templateApplied: true, sourceKind: admitted.template.source.kind, semanticLayoutsMapped: ir.pages.length, masterPreserved, libreOfficeValidated: true })
  });
}

module.exports = { buildUserTemplateArchiveCase, packagePartSha256 };

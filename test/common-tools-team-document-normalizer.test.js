"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createTeamDocumentNormalizer } = require("../packages/slideclone-core/team-document-normalizer");

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-document-normalizer-"));
  fs.mkdirSync(path.join(root, "assets"));
  const source = path.join(root, "assets", "source.pdf");
  fs.writeFileSync(source, "%PDF-1.4\n%%EOF\n", "utf8");
  return { root, source, png: path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png") };
}

test("team document normalizer renders a bounded contiguous PDF page set with fixed arguments", async () => {
  const fixture = fixtureRoot(); const calls = [];
  const execFile = (command, args, _options, callback) => {
    calls.push({ command, args });
    const prefix = args.at(-1); fs.copyFileSync(fixture.png, `${prefix}-1.png`); fs.copyFileSync(fixture.png, `${prefix}-2.png`); callback(null);
  };
  try {
    const normalize = createTeamDocumentNormalizer({ pdfToPpmExecutable: "fixed-pdftoppm", execFile });
    const result = await normalize({ root: fixture.root, metadata: { kind: "raw-document", documentKind: "pdf", inputFile: fixture.source }, isCancellationRequested: async () => false });
    assert.equal(result.pages, 2); assert.deepEqual(result.sources.map((source) => source.assetPath), ["assets/source-001.png", "assets/source-002.png"]);
    assert.equal(calls.length, 1); assert.equal(calls[0].command, "fixed-pdftoppm");
    assert.deepEqual(calls[0].args.slice(0, 8), ["-png", "-r", "144", "-f", "1", "-l", "21", fixture.source]);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("team document normalizer rejects more than twenty rendered pages and honors cancellation", async () => {
  const fixture = fixtureRoot();
  const execFile = (_command, args, _options, callback) => { const prefix = args.at(-1); for (let page = 1; page <= 21; page += 1) fs.copyFileSync(fixture.png, `${prefix}-${page}.png`); callback(null); };
  try {
    const normalize = createTeamDocumentNormalizer({ execFile });
    await assert.rejects(() => normalize({ root: fixture.root, metadata: { kind: "raw-document", documentKind: "pdf", inputFile: fixture.source }, isCancellationRequested: async () => false }), /twenty-page limit/);
    const cancelledRoot = fixtureRoot();
    try {
      await assert.rejects(() => normalize({ root: cancelledRoot.root, metadata: { kind: "raw-document", documentKind: "pdf", inputFile: cancelledRoot.source }, isCancellationRequested: async () => true }), /cancelled/);
    } finally { fs.rmSync(cancelledRoot.root, { recursive: true, force: true }); }
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("team document normalizer converts PPTX through fixed LibreOffice arguments before rendering", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-pptx-normalizer-")); const assets = path.join(root, "assets"); fs.mkdirSync(assets);
  const source = path.join(assets, "source.pptx"); fs.writeFileSync(source, "package", "utf8");
  const png = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"); const calls = [];
  const execFile = (command, args, _options, callback) => {
    calls.push({ command, args });
    if (command === "fixed-soffice") fs.writeFileSync(path.join(args[args.indexOf("--outdir") + 1], "source.pdf"), "%PDF-1.4\n%%EOF\n", "utf8");
    else fs.copyFileSync(png, `${args.at(-1)}-1.png`);
    callback(null);
  };
  try {
    const normalize = createTeamDocumentNormalizer({ sofficeExecutable: "fixed-soffice", pdfToPpmExecutable: "fixed-pdftoppm", execFile });
    const result = await normalize({ root, metadata: { kind: "raw-document", documentKind: "pptx", inputFile: source }, isCancellationRequested: async () => false });
    assert.equal(result.pages, 1); assert.deepEqual(calls.map((call) => call.command), ["fixed-soffice", "fixed-pdftoppm"]);
    assert.equal(calls[0].args.includes("--convert-to"), true); assert.equal(calls[0].args.includes("pdf"), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

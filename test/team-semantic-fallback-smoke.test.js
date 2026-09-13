"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { extractProjectArchive } = require("../packages/archive-core");
const { validatePackage } = require("../packages/slideclone-worker-adapter/team-worker");
const { createRawImageNativeRebuilder } = require("../packages/slideclone-core/team-native-rebuild");

const CLI_PATH = path.resolve(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
const FIXTURE_DIR = path.resolve(__dirname, "..", "examples", "team-semantic-fallback");

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-semantic-fallback-smoke-"));
  const sourcePng = path.join(root, "source.png");
  const fallbackJson = path.join(root, "semantic-fallback.json");
  const batchFallbackJson = path.join(root, "batch-semantic-fallback.json");
  fs.copyFileSync(path.join(FIXTURE_DIR, "source.png"), sourcePng);
  fs.copyFileSync(path.join(FIXTURE_DIR, "semantic-fallback.json"), fallbackJson);
  fs.copyFileSync(path.join(FIXTURE_DIR, "batch-semantic-fallback.json"), batchFallbackJson);
  return { root, sourcePng, fallbackJson, batchFallbackJson };
}

test("end-to-end smoke: packaging, archive admission, and native rebuild using sample fixture", async () => {
  const workspace = createWorkspace();
  const archiveFile = path.join(workspace.root, "upload-source.tar.gz");
  const extractedDir = path.join(workspace.root, "extracted");
  const rebuildWorkDir = path.join(workspace.root, "rebuild-work");

  try {
    // 1. CLI Packaging with editable-source-archive
    const cliResult = childProcess.spawnSync(process.execPath, [
      CLI_PATH, "team", "editable-source-archive",
      "--workspace", workspace.root,
      "--input", "source.png",
      "--semantic-fallback", "semantic-fallback.json",
      "--out", "upload-source.tar.gz"
    ], { encoding: "utf8", windowsHide: true });

    assert.equal(cliResult.status, 0, cliResult.stderr);
    const cliOutput = JSON.parse(cliResult.stdout);
    assert.equal(cliOutput.contentType, "application/gzip");
    assert.equal(cliOutput.semanticFallback, "assets/semantic-fallback.json");
    assert.equal(cliOutput.pages, 1);
    assert.equal(fs.existsSync(archiveFile), true);

    // 2. Archive Admission Verification
    fs.mkdirSync(extractedDir);
    extractProjectArchive(fs.readFileSync(archiveFile), extractedDir, { label: "editable" });
    const packageInfo = validatePackage(extractedDir);
    assert.equal(packageInfo.kind, "raw-image");
    assert.equal(packageInfo.pages, 1);
    assert.equal(packageInfo.sources.length, 1);

    const admittedSource = packageInfo.sources[0];
    assert.ok(admittedSource.semanticFallback);
    assert.equal(admittedSource.semanticFallback.archetype, "process_flow");
    assert.equal(admittedSource.semanticFallback.items.length, 4);
    assert.equal(admittedSource.semanticFallback.items[0].title, "识别");
    assert.equal(admittedSource.semanticFallback.items[0].badge, "01");
    assert.equal(admittedSource.semanticFallback.items[1].title, "归档");
    assert.equal(admittedSource.semanticFallback.items[2].title, "准入");
    assert.equal(admittedSource.semanticFallback.items[3].title, "重建");

    // 3. Native Rebuild Verification
    fs.mkdirSync(rebuildWorkDir);
    const rebuilder = createRawImageNativeRebuilder({
      rebuildDeckFromWorkDir() {
        return {
          slideSize: { widthPt: 960, heightPt: 540 },
          pages: [{ source: {}, intent: {}, images: [], textBoxes: [], shapes: [] }]
        };
      }
    });

    const rebuilt = await rebuilder({
      root: rebuildWorkDir,
      metadata: admittedSource,
      ocr: { lines: [] },
      isCancellationRequested: () => false
    });

    const page = rebuilt.deck.pages[0];
    assert.equal(page.source.declarativeRebuild.status, "matched");
    assert.equal(page.source.declarativeRebuild.matchedPlugin, "builtin-step-chain");
    assert.equal(page.source.declarativeRebuild.qualityPassed, true);
    assert.ok(page.shapes.length > 0);
    assert.ok(page.textBoxes.length >= 4);
    assert.ok(page.textBoxes.some((item) => item.text === "识别" && item.source?.declarativeRebuilder === true));
    assert.ok(page.textBoxes.some((item) => item.text === "归档" && item.source?.declarativeRebuilder === true));
    assert.ok(page.textBoxes.some((item) => item.text === "准入" && item.source?.declarativeRebuilder === true));
    assert.ok(page.textBoxes.some((item) => item.text === "重建" && item.source?.declarativeRebuilder === true));
    assert.ok(page.shapes.every((shape) => shape.source?.declarativeRebuilder === true));
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("end-to-end smoke: legacy raw-image-archive CLI preserves semantic fallback parity", () => {
  const workspace = createWorkspace();
  const archiveFile = path.join(workspace.root, "upload-legacy.tar.gz");
  const extractedDir = path.join(workspace.root, "extracted-legacy");

  try {
    const cliResult = childProcess.spawnSync(process.execPath, [
      CLI_PATH, "team", "raw-image-archive",
      "--workspace", workspace.root,
      "--input", "source.png",
      "--semantic-fallback", "semantic-fallback.json",
      "--out", "upload-legacy.tar.gz"
    ], { encoding: "utf8", windowsHide: true });

    assert.equal(cliResult.status, 0, cliResult.stderr);
    const cliOutput = JSON.parse(cliResult.stdout);
    assert.equal(cliOutput.semanticFallback, "assets/semantic-fallback.json");

    fs.mkdirSync(extractedDir);
    extractProjectArchive(fs.readFileSync(archiveFile), extractedDir, { label: "editable" });
    const packageInfo = validatePackage(extractedDir);
    assert.equal(packageInfo.kind, "raw-image");
    assert.equal(packageInfo.sources[0].semanticFallback.archetype, "process_flow");
    assert.equal(packageInfo.sources[0].semanticFallback.items.length, 4);
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("end-to-end smoke: multi-page batch archive routes semantic fallback to declared page index", () => {
  const workspace = createWorkspace();
  const secondPng = path.join(workspace.root, "source-002.png");
  fs.copyFileSync(workspace.sourcePng, secondPng);
  const archiveFile = path.join(workspace.root, "upload-batch.tar.gz");
  const extractedDir = path.join(workspace.root, "extracted-batch");

  try {
    const cliResult = childProcess.spawnSync(process.execPath, [
      CLI_PATH, "team", "editable-source-archive",
      "--workspace", workspace.root,
      "--inputs", "source.png,source-002.png",
      "--semantic-fallback", "batch-semantic-fallback.json",
      "--out", "upload-batch.tar.gz"
    ], { encoding: "utf8", windowsHide: true });

    assert.equal(cliResult.status, 0, cliResult.stderr);
    const cliOutput = JSON.parse(cliResult.stdout);
    assert.equal(cliOutput.pages, 2);
    assert.equal(cliOutput.semanticFallback, "assets/semantic-fallback.json");

    fs.mkdirSync(extractedDir);
    extractProjectArchive(fs.readFileSync(archiveFile), extractedDir, { label: "editable" });
    const packageInfo = validatePackage(extractedDir);
    assert.equal(packageInfo.pages, 2);
    assert.equal(packageInfo.sources[0].semanticFallback.archetype, "process_flow");
    assert.equal(packageInfo.sources[0].semanticFallback.items.length, 2);
    assert.equal(packageInfo.sources[1].semanticFallback, undefined);
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("caller protocol misuse protection: rejects geometry in semantic fallback sidecar", () => {
  const workspace = createWorkspace();
  const badFallback = path.join(workspace.root, "bad-geometry.json");
  const targetArchive = path.join(workspace.root, "bad.tar.gz");
  fs.writeFileSync(badFallback, JSON.stringify({
    semanticFallback: {
      items: [{ title: "Illegal", box: { x: 10, y: 20, w: 100, h: 50 } }]
    }
  }), "utf8");

  try {
    const rejected = childProcess.spawnSync(process.execPath, [
      CLI_PATH, "team", "editable-source-archive",
      "--workspace", workspace.root,
      "--input", "source.png",
      "--semantic-fallback", "bad-geometry.json",
      "--out", "bad.tar.gz"
    ], { encoding: "utf8", windowsHide: true });

    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /must not contain geometry key "box"/);
    assert.equal(fs.existsSync(targetArchive), false);
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("caller protocol misuse protection: rejects semantic fallback sidecar for document inputs", () => {
  const workspace = createWorkspace();
  const pdfFile = path.join(workspace.root, "document.pdf");
  const targetArchive = path.join(workspace.root, "doc-rejected.tar.gz");
  fs.writeFileSync(pdfFile, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n", "utf8");

  try {
    const rejected = childProcess.spawnSync(process.execPath, [
      CLI_PATH, "team", "editable-source-archive",
      "--workspace", workspace.root,
      "--input", "document.pdf",
      "--semantic-fallback", "semantic-fallback.json",
      "--out", "doc-rejected.tar.gz"
    ], { encoding: "utf8", windowsHide: true });

    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /semantic fallback metadata is only supported for raw image archives/);
    assert.equal(fs.existsSync(targetArchive), false);
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

test("caller protocol misuse protection: rejects sidecars exceeding normalized 64KiB limit", () => {
  const workspace = createWorkspace();
  const bigFallback = path.join(workspace.root, "big-sidecar.json");
  const targetArchive = path.join(workspace.root, "big-rejected.tar.gz");
  const slotValues = {};
  for (let index = 0; index < 132; index += 1) {
    slotValues[`slot_${index}`] = "x".repeat(483);
  }
  fs.writeFileSync(bigFallback, JSON.stringify({ slotValues }), "utf8");

  try {
    const rejected = childProcess.spawnSync(process.execPath, [
      CLI_PATH, "team", "editable-source-archive",
      "--workspace", workspace.root,
      "--input", "source.png",
      "--semantic-fallback", "big-sidecar.json",
      "--out", "big-rejected.tar.gz"
    ], { encoding: "utf8", windowsHide: true });

    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /normalized size limit/);
    assert.equal(fs.existsSync(targetArchive), false);
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
});

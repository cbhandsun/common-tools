"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const renderLibreOffice = require("../skills/pd-hifi-slideclone/scripts/adapters/render-libreoffice");

test("render LibreOffice recognizes retryable transient PDF read errors", () => {
  const { isRetryablePdfReadError } = renderLibreOffice._private;

  assert.equal(isRetryablePdfReadError(new Error("I/O Error: Couldn't open file 'x.pdf': No error.")), true);
  assert.equal(isRetryablePdfReadError({ stderr: "permission denied while reading PDF" }), true);
  assert.equal(isRetryablePdfReadError(new Error("syntax error in command line")), false);
});

test("render LibreOffice waits until generated PDF file is stable", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-lo-stable-"));
  const file = path.join(tmp, "deck.pdf");
  fs.writeFileSync(file, Buffer.alloc(128));

  await assert.doesNotReject(renderLibreOffice._private.waitForStableFile(file, {
    timeoutMs: 1000,
    intervalMs: 20
  }));
});

test("render LibreOffice stages long PDF paths before Poppler reads them", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-lo-stage-"));
  let dir = tmp;
  while (dir.length < 185) {
    dir = path.join(dir, "nested-long-segment");
  }
  fs.mkdirSync(dir, { recursive: true });
  const pdf = path.join(dir, "deck.pdf");
  fs.writeFileSync(pdf, Buffer.alloc(16));

  const staged = renderLibreOffice._private.stagePdfForRenderer(pdf);

  assert.notEqual(path.resolve(staged.file), path.resolve(pdf));
  assert.equal(fs.existsSync(staged.file), true);
  assert.ok(staged.file.length < path.resolve(pdf).length);
  fs.rmSync(staged.cleanupDir, { recursive: true, force: true });
});

test("render LibreOffice stages conversion input, output, and profile outside a deep workspace", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-lo-convert-stage-"));
  let dir = tmp;
  while (path.join(dir, "render", "iteration-0", "lo-profile").length < 185) {
    dir = path.join(dir, "nested-long-segment");
  }
  const renderDir = path.join(dir, "render", "iteration-0");
  fs.mkdirSync(renderDir, { recursive: true });
  const pptx = path.join(dir, "deck.pptx");
  fs.writeFileSync(pptx, Buffer.alloc(16));

  const staged = renderLibreOffice._private.stageLibreOfficeConversion(pptx, renderDir);

  try {
    assert.notEqual(path.resolve(staged.pptxFile), path.resolve(pptx));
    assert.equal(fs.existsSync(staged.pptxFile), true);
    assert.ok(staged.profileDir.length < path.join(renderDir, "lo-profile").length);
    assert.ok(staged.renderDir.length < renderDir.length);
  } finally {
    renderLibreOffice._private.cleanupStagedConversion(staged);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

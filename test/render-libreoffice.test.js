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

test("render LibreOffice waits until generated PDF file is stable", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-lo-stable-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const file = path.join(tmp, "deck.pdf");
  fs.writeFileSync(file, Buffer.alloc(128));

  await assert.doesNotReject(renderLibreOffice._private.waitForStableFile(file, {
    timeoutMs: 1000,
    intervalMs: 20
  }));
});

test("render LibreOffice stages long PDF paths before Poppler reads them", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-lo-stage-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  let dir = tmp;
  while (dir.length < 185) {
    dir = path.join(dir, "nested-long-segment");
  }
  fs.mkdirSync(dir, { recursive: true });
  const pdf = path.join(dir, "deck.pdf");
  fs.writeFileSync(pdf, Buffer.alloc(16));

  const staged = renderLibreOffice._private.stagePdfForRenderer(pdf);
  t.after(() => fs.rmSync(staged.cleanupDir, { recursive: true, force: true }));

  assert.notEqual(path.resolve(staged.file), path.resolve(pdf));
  assert.equal(fs.existsSync(staged.file), true);
  assert.ok(staged.file.length < path.resolve(pdf).length);
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

test("each LibreOffice conversion owns a fresh profile and cannot reuse an earlier PDF", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lo-isolation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "deck.pptx");
  const output = path.join(root, "render");
  fs.writeFileSync(input, "controlled fixture");
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, "deck.pdf"), "stale output");
  const first = renderLibreOffice._private.stageLibreOfficeConversion(input, output);
  t.after(() => renderLibreOffice._private.cleanupStagedConversion(first));
  const second = renderLibreOffice._private.stageLibreOfficeConversion(input, output);
  t.after(() => renderLibreOffice._private.cleanupStagedConversion(second));
  assert.notEqual(first.profileDir, second.profileDir, "separate attempts cannot share a profile lock");
  assert.notEqual(first.renderDir, second.renderDir);
  const expectedPdf = path.join(first.renderDir, `${path.basename(first.pptxFile, ".pptx")}.pdf`);
  assert.equal(fs.existsSync(expectedPdf), false, "no fresh output exists before conversion");
  assert.equal(fs.readFileSync(first.pptxFile, "utf8"), "controlled fixture");
  assert.equal(fs.readFileSync(path.join(output, "deck.pdf"), "utf8"), "stale output", "prior evidence is preserved");
});

test("render attempts isolate old pages and reject invalid iteration paths before writing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lo-render-attempt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const create = renderLibreOffice._private.createRenderDirectory;
  const first = create(root, 0);
  fs.writeFileSync(path.join(first, "page-10.png"), "old page");
  const second = create(root, 0);
  assert.notEqual(first, second);
  assert.deepEqual(fs.readdirSync(second), []);
  assert.equal(fs.readFileSync(path.join(first, "page-10.png"), "utf8"), "old page");
  for (const iteration of ["../escape", -1, 1.5, Infinity, NaN, {}, null, "", false, "0", 10001]) {
    assert.throws(() => create(root, iteration), /iteration is invalid/);
  }
  assert.ok(create(root, 10000).startsWith(path.join(root, "render", "iteration-10000")));
  const missing = path.join(root, "not-created");
  assert.throws(() => create(missing, "../escape"));
  assert.equal(fs.existsSync(missing), false);
});

function trackOwnedStages(t) {
  const owned = [];
  const originalCreate = fs.mkdtempSync;
  const originalRemove = fs.rmSync;
  t.mock.method(fs, "mkdtempSync", (...args) => {
    const created = originalCreate(...args);
    if (["slideclone-lo-", "slideclone-pdf-"].some((prefix) => path.basename(created).startsWith(prefix))) owned.push(created);
    return created;
  });
  t.after(() => { for (const directory of owned) originalRemove(directory, { recursive: true, force: true }); });
  return owned;
}

test("failed staging removes its partial directories and preserves the original error", (t) => {
  const owned = trackOwnedStages(t);
  const failure = new Error("controlled input copy failure");
  t.mock.method(fs, "copyFileSync", () => { throw failure; });
  for (const stage of [
    () => renderLibreOffice._private.stageLibreOfficeConversion(path.resolve("missing.pptx")),
    () => renderLibreOffice._private.stagePdfForRenderer(path.resolve("long-segment/".repeat(20), "missing.pdf"))
  ]) {
    assert.throws(stage, (error) => error === failure);
    assert.ok(owned.length > 0);
    assert.ok(owned.every((directory) => !fs.existsSync(directory)), "failed staging must not leak allocated directories");
  }
});

test("staging initialization failure cleans its directory and reports cleanup failure separately", (t) => {
  const owned = trackOwnedStages(t);
  const operationFailure = new Error("controlled mkdir failure");
  t.mock.method(fs, "mkdirSync", () => { throw operationFailure; });
  assert.throws(() => renderLibreOffice._private.stageLibreOfficeConversion(path.resolve("missing.pptx")), (error) => error === operationFailure);
  assert.equal(fs.existsSync(owned[0]), false);
  const cleanupFailure = new Error("controlled cleanup failure");
  t.mock.method(fs, "rmSync", () => { throw cleanupFailure; });
  assert.throws(() => renderLibreOffice._private.stageLibreOfficeConversion(path.resolve("missing.pptx")), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [operationFailure, cleanupFailure]);
    assert.equal(error.cause, cleanupFailure);
    return true;
  });
});

function rendererWithProcess(t, run) {
  const processAdapter = require("../packages/slideclone-core/renderer-process");
  const entry = require.resolve("../packages/slideclone-core/render-libreoffice");
  const previous = require.cache[entry];
  const replacement = t.mock.method(processAdapter, "run", run);
  delete require.cache[entry];
  try { return require(entry); }
  finally { require.cache[entry] = previous; replacement.mock.restore(); }
}

test("renderer releases owned conversion and PDF stages after retry exhaustion without deleting delivery files", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lo-failure-lifecycle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owned = trackOwnedStages(t);
  const source = path.join(root, "deck.pptx");
  fs.writeFileSync(source, "controlled source");
  const sibling = path.join(root, "sibling.pdf");
  fs.writeFileSync(sibling, "another attempt");
  let outputDir = root;
  while (outputDir.length < 185) outputDir = path.join(outputDir, "nested-long-segment");
  let attempts = 0;
  let stagedPdf;
  const failure = new Error("permission denied while reading PDF");
  const renderer = rendererWithProcess(t, async (_command, args) => {
    if (args.includes("--convert-to")) {
      const output = args[args.indexOf("--outdir") + 1];
      fs.writeFileSync(path.join(output, "input.pdf"), "%PDF-controlled");
      return { stdout: "", stderr: "" };
    }
    attempts += 1;
    stagedPdf = args.at(-2);
    assert.equal(fs.readFileSync(stagedPdf, "utf8"), "%PDF-controlled");
    throw failure;
  });
  await assert.rejects(renderer({ pptx: { pptxFile: source } }, { outputDir, config: { render: {
    pdfReadyPollMs: 20, pdfReadyTimeoutMs: 1000, pdfRenderRetries: 2, pdfRenderRetryDelayMs: 1
  } } }), (error) => error === failure);
  assert.equal(attempts, 2);
  assert.equal(owned.length, 2);
  assert.ok(owned.every((directory) => !fs.existsSync(directory)));
  assert.equal(fs.existsSync(stagedPdf), false);
  const iterationDir = path.join(outputDir, "render", "iteration-0");
  const attemptDir = path.join(iterationDir, fs.readdirSync(iterationDir)[0]);
  assert.equal(fs.readFileSync(path.join(attemptDir, "deck.pdf"), "utf8"), "%PDF-controlled");
  assert.equal(fs.readFileSync(source, "utf8"), "controlled source");
  assert.equal(fs.readFileSync(sibling, "utf8"), "another attempt");
});

for (const mode of ["success", "conversion failure", "cleanup failure", "conversion and cleanup failure"]) {
  test(`renderer temporary lifecycle: ${mode}`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lo-lifecycle-"));
    const originalRemove = fs.rmSync;
    t.after(() => originalRemove(root, { recursive: true, force: true }));
    const owned = trackOwnedStages(t);
    const source = path.join(root, "deck.pptx");
    fs.writeFileSync(source, "controlled source");
    const operationFailure = new Error("controlled conversion failure");
    const cleanupFailure = new Error("controlled cleanup failure");
    let popplerCalls = 0;
    let deliveredPdf;
    if (mode.includes("cleanup failure")) {
      t.mock.method(fs, "rmSync", (target, options) => {
        if (owned.includes(target)) throw cleanupFailure;
        return originalRemove(target, options);
      });
    }
    const renderer = rendererWithProcess(t, async (_command, args) => {
      if (args.includes("--convert-to")) {
        if (mode.startsWith("conversion")) throw operationFailure;
        fs.writeFileSync(path.join(args[args.indexOf("--outdir") + 1], "input.pdf"), "%PDF-controlled");
      } else {
        popplerCalls += 1;
        deliveredPdf = args.at(-2);
        fs.writeFileSync(`${args.at(-1)}-1.png`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"));
      }
      return { stdout: "", stderr: "" };
    });
    const pending = renderer({ pptx: { pptxFile: source } }, { outputDir: root, config: { render: { pdfReadyPollMs: 20, pdfReadyTimeoutMs: 1000 } } });
    if (mode === "success") {
      const result = await pending;
      assert.equal(result.ok, true);
      assert.equal(result.renderedPageCount, 1);
      assert.equal(popplerCalls, 1);
      assert.equal(fs.readFileSync(deliveredPdf, "utf8"), "%PDF-controlled", "short paths retain their non-staged PDF");
      assert.equal(fs.existsSync(result.pages[0].image), true);
    } else {
      await assert.rejects(pending, (error) => {
        if (mode === "conversion and cleanup failure") {
          assert.ok(error instanceof AggregateError);
          assert.deepEqual(error.errors, [operationFailure, cleanupFailure]);
        } else assert.equal(error, mode === "conversion failure" ? operationFailure : cleanupFailure);
        return true;
      });
      assert.equal(popplerCalls, 0);
    }
    assert.equal(owned.length, 1);
    if (!mode.includes("cleanup failure")) assert.equal(fs.existsSync(owned[0]), false);
    assert.equal(fs.readFileSync(source, "utf8"), "controlled source");
  });
}

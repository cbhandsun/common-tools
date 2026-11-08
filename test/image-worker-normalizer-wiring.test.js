"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createNativeRebuilder } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { readPng, writePng } = require("../packages/slideclone-core/png");

function fixture(t, extension = ".jpg") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-worker-normalizer-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputFile = path.join(root, `source${extension}`);
  writePng(inputFile, { width: 64, height: 48, rgba: Buffer.alloc(64 * 48 * 4, 255) });
  return { root, metadata: { inputFile, assetPath: `assets/source${extension}`, dimensions: { widthPx: 64, heightPx: 48 } },
    ocr: { lines: [] }, isCancellationRequested: () => false };
}

function dependencies() {
  let generated = 0;
  return {
    count: () => generated,
    loadImplementation: () => ({ rebuildDeckFromWorkDir(workDir) {
      generated += 1;
      return JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    } })
  };
}

test("native Worker factory forwards an explicit image normalizer independently of OCR provider", async (t) => {
  const request = fixture(t);
  const deps = dependencies();
  const calls = [];
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
    ...deps, normalizeImageFile: async (input) => {
      calls.push(input);
      writePng(input.outputFile, readPng(input.inputFile));
    }
  });
  const result = await rebuild(request);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].inputFile, request.metadata.inputFile);
  assert.deepEqual(calls[0].dimensions, request.metadata.dimensions);
  assert.equal(calls[0].isCancellationRequested, request.isCancellationRequested);
  assert.equal(deps.count(), 1);
  assert.equal(readPng(result.sourceImage).width, 64);
});

test("PNG input retains the existing copy path without invoking the optional normalizer", async (t) => {
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
    ...dependencies(), normalizeImageFile: () => { throw new Error("must not normalize PNG"); }
  });
  await rebuild(fixture(t, ".png"));
});

test("missing JPEG normalization and failed normalization stop before reconstruction", async (t) => {
  const request = fixture(t);
  const missing = dependencies();
  await assert.rejects(createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, missing)(request), /configured JPEG normalizer/);
  assert.equal(missing.count(), 0);
  const failing = dependencies();
  const failure = new Error("normalizer failed");
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
    ...failing, normalizeImageFile: () => { throw failure; }
  });
  await assert.rejects(rebuild(request), (error) => error === failure);
  assert.equal(failing.count(), 0);
});

test("invalid injected normalizers fail closed rather than replacing the provider default", () => {
  for (const normalizeImageFile of [null, false, "command", {}, 1]) {
    assert.throws(() => createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
      ...dependencies(), normalizeImageFile
    }), /normalizer is invalid/);
  }
});

test("cancelled normalized input never reaches native reconstruction", async (t) => {
  const request = fixture(t);
  request.isCancellationRequested = () => true;
  const deps = dependencies();
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
    ...deps, normalizeImageFile: (input) => writePng(input.outputFile, readPng(input.inputFile))
  });
  await assert.rejects(rebuild(request), /cancelled/);
  assert.equal(deps.count(), 0);
});

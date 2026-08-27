"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  collectPptxFiles,
  dryRunReport,
  formatEditableBatchProgress,
  isFlagEnabled,
  normalizeNormalizer,
  normalizeSampleStrategy,
  normalizeTextOverlayVisibility,
  parseConcurrency,
  parsePageConcurrency,
  recommendBatchConcurrency,
  recommendPageConcurrency,
  recommendResourceAwareConcurrency,
  runLimited,
  safeProgressName,
  selectPptxFileEntries,
  selectPptxFiles,
  summarizeError
} = require("../skills/pd-hifi-slideclone/scripts/real-pptx-editable-batch");
const {
  recommend
} = require("../skills/pd-hifi-slideclone/scripts/render-engine-report");
const {
  aggregateReports,
  recommendNativeRebuildConcurrency,
  safeFileStem,
  summarizeWorkerFailure,
  workerArgv
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native-parallel");

test("real PPTX batch treats CLI flag strings as enabled", () => {
  assert.equal(isFlagEnabled("true"), true);
  assert.equal(isFlagEnabled("1"), true);
  assert.equal(isFlagEnabled(true), true);
  assert.equal(isFlagEnabled("false"), false);
  assert.equal(isFlagEnabled(undefined), false);
});

test("real PPTX batch can target one explicit PPTX instead of directory order", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-pptx-select-"));
  const first = path.join(tempDir, "a.pptx");
  const second = path.join(tempDir, "b.pptx");
  fs.writeFileSync(first, "not a real pptx");
  fs.writeFileSync(second, "not a real pptx");

  assert.deepEqual(collectPptxFiles({ inputDir: tempDir, pptx: second }), [second]);
  assert.deepEqual(
    collectPptxFiles({ inputDir: tempDir }).map((file) => path.basename(file)),
    ["a.pptx", "b.pptx"]
  );
});

test("real PPTX batch supports representative dry-run sampling", () => {
  const files = ["a.pptx", "b.pptx", "c.pptx", "d.pptx", "e.pptx"];
  const inventory = new Map([
    ["a.pptx", { slideCount: 2, sizeBytes: 20 }],
    ["b.pptx", { slideCount: 18, sizeBytes: 80 }],
    ["c.pptx", { slideCount: 7, sizeBytes: 400 }],
    ["d.pptx", { slideCount: 4, sizeBytes: 10 }],
    ["e.pptx", { slideCount: 10, sizeBytes: 60 }]
  ]);

  assert.equal(normalizeSampleStrategy("balanced"), "diverse");
  assert.deepEqual(selectPptxFiles(files, { maxFiles: 3, sampleStrategy: "ordered" }), ["a.pptx", "b.pptx", "c.pptx"]);
  assert.deepEqual(selectPptxFiles(files, {
    maxFiles: 3,
    sampleStrategy: "diverse",
    inventoryProvider: (file) => inventory.get(file)
  }), ["a.pptx", "b.pptx", "c.pptx"]);
  const entries = selectPptxFileEntries(files, {
    maxFiles: 3,
    sampleStrategy: "diverse",
    inventoryProvider: (file) => inventory.get(file)
  });
  assert.ok(entries.find((entry) => entry.file === "a.pptx").selectionReasons.includes("fewest-slides"));
  assert.ok(entries.find((entry) => entry.file === "b.pptx").selectionReasons.includes("most-slides"));
  assert.ok(entries.find((entry) => entry.file === "c.pptx").selectionReasons.includes("largest-file"));

  const report = dryRunReport({
    inputDir: "in",
    outputRoot: "out",
    pptxFiles: ["a.pptx"],
    selectedFileEntries: [{ file: "a.pptx", slideCount: 2, sizeBytes: 20, selectionReasons: ["fewest-slides"] }],
    maxPages: 2,
    sampleStrategy: "diverse"
  });
  assert.equal(report.sampleStrategy, "diverse");
  assert.deepEqual(report.files[0].selectionReasons, ["fewest-slides"]);
});

test("real PPTX batch normalizer aliases are explicit", () => {
  assert.equal(normalizeNormalizer(undefined), "libreoffice");
  assert.equal(normalizeNormalizer("libreoffice"), "libreoffice");
  assert.equal(normalizeNormalizer("lo"), "libreoffice");
  assert.equal(normalizeNormalizer("powerpoint-com"), "powerpoint-com");
  assert.equal(normalizeNormalizer("ppt"), "powerpoint-com");
  assert.throws(() => normalizeNormalizer("commercial"), /normalizer/);
});

test("real PPTX batch hides editable OCR overlay unless debug visibility is requested", () => {
  assert.equal(normalizeTextOverlayVisibility(undefined), "hidden");
  assert.equal(normalizeTextOverlayVisibility("transparent"), "hidden");
  assert.equal(normalizeTextOverlayVisibility("visible"), "visible");
  assert.equal(normalizeTextOverlayVisibility("debug"), "visible");
});

test("real PPTX batch bounds requested concurrency", () => {
  assert.equal(parseConcurrency(undefined), 1);
  assert.equal(parseConcurrency("0"), 1);
  assert.equal(parseConcurrency("-3"), 1);
  assert.equal(parseConcurrency("2"), 2);
  assert.equal(parseConcurrency("99"), 8);
});

test("real PPTX batch bounds explicit per-deck page concurrency", () => {
  assert.equal(parsePageConcurrency(undefined), 1);
  assert.equal(parsePageConcurrency("0"), 1);
  assert.equal(parsePageConcurrency("-3"), 1);
  assert.equal(parsePageConcurrency("3"), 3);
  assert.equal(parsePageConcurrency("99"), 4);
});

test("real PPTX batch recommends resource-aware conservative concurrency", () => {
  assert.equal(recommendBatchConcurrency({ normalizer: "libreoffice", fileCount: 1, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 1);
  assert.equal(recommendBatchConcurrency({ normalizer: "libreoffice", fileCount: 8, cpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3 }), 2);
  assert.equal(recommendBatchConcurrency({ normalizer: "libreoffice", fileCount: 8, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 2);
  assert.equal(recommendBatchConcurrency({ normalizer: "powerpoint-com", fileCount: 8, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 1);
});

test("real PPTX batch recommends bounded page concurrency for large decks", () => {
  assert.equal(recommendPageConcurrency({ pageCount: 1, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 1);
  assert.equal(recommendPageConcurrency({ pageCount: 20, cpuCount: 4, totalMemoryBytes: 8 * 1024 ** 3 }), 1);
  assert.equal(recommendPageConcurrency({ pageCount: 20, cpuCount: 12, totalMemoryBytes: 24 * 1024 ** 3 }), 3);
  assert.equal(recommendPageConcurrency({ pageCount: 20, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 4);
});

test("resource-aware concurrency accounts for CPU, memory, and workload limits", () => {
  assert.equal(recommendResourceAwareConcurrency({ workload: "office-render", cpuCount: 4, totalMemoryBytes: 8 * 1024 ** 3 }), 1);
  assert.equal(recommendResourceAwareConcurrency({ workload: "office-render", cpuCount: 12, totalMemoryBytes: 24 * 1024 ** 3 }), 2);
  assert.equal(recommendResourceAwareConcurrency({ workload: "native-rebuild", cpuCount: 16, totalMemoryBytes: 32 * 1024 ** 3 }), 3);
  assert.equal(recommendResourceAwareConcurrency({ workload: "page-ocr-vision", cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 4);
  assert.equal(recommendResourceAwareConcurrency({ workload: "office-com", cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 1);
});

test("real PPTX batch runLimited preserves input order while allowing parallel workers", async () => {
  const started = [];
  const results = await runLimited([3, 1, 2], 2, async (value) => {
    started.push(value);
    await new Promise((resolve) => setTimeout(resolve, value * 5));
    return value * 10;
  });

  assert.deepEqual(results, [30, 10, 20]);
  assert.deepEqual(started.slice(0, 2), [3, 1]);
});

test("real PPTX batch progress output is bounded and log-safe", () => {
  assert.equal(safeProgressName("deck\r\nsecret.pptx"), "deck  secret.pptx");

  const line = formatEditableBatchProgress({
    deckName: "deck\nx.pptx",
    stage: "page:done",
    pageIndex: 1,
    pageCount: 20,
    elapsedMs: 123.4
  });

  assert.equal(line, "[editable-batch] progress deck x.pptx page:done p2/20 123ms\n");
});

test("parallel native rebuild strips wrapper-only worker arguments", () => {
  assert.deepEqual(
    workerArgv(["--work-root", "work", "--concurrency", "4", "--only", "deck", "--report-file", "x.json", "--smart-native-layers", "true"]),
    ["--work-root", "work", "--smart-native-layers", "true"]
  );
});

test("parallel native rebuild uses resource-aware default concurrency", () => {
  assert.equal(recommendNativeRebuildConcurrency({ workDirCount: 1, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 1);
  assert.equal(recommendNativeRebuildConcurrency({ workDirCount: 8, cpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3 }), 2);
  assert.equal(recommendNativeRebuildConcurrency({ workDirCount: 8, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 4);
});

test("parallel native rebuild aggregates worker reports without losing failures", () => {
  const report = aggregateReports({
    workRoot: "work",
    outRoot: "out",
    concurrency: 2,
    reportDir: "reports",
    results: [
      {
        ok: true,
        baseName: "a",
        reportFile: "a.json",
        elapsedMs: 10,
        report: {
          totals: { files: 1, pages: 2, images: 3, shapes: 4, textBoxes: 5, failed: 0 },
          results: [{ inputWorkDir: "a.work", status: "converted" }]
        }
      },
      {
        ok: false,
        baseName: "b",
        elapsedMs: 20,
        error: summarizeWorkerFailure("boom", "stderr", "stdout")
      }
    ]
  });

  assert.equal(report.totals.files, 1);
  assert.equal(report.totals.pages, 2);
  assert.equal(report.totals.failed, 1);
  assert.equal(report.concurrencyPolicy, "resource-aware-v1");
  assert.equal(report.results.length, 2);
  assert.equal(report.results[1].status, "failed");
});

test("parallel native rebuild sanitizes worker report file names", () => {
  assert.equal(safeFileStem('a/b:c*"deck"'), "a_b_c__deck_");
  assert.equal(safeFileStem(""), "deck");
});

test("real PPTX batch summarizes failures without throwing raw error objects", () => {
  const summary = summarizeError(Object.assign(new Error("boom"), {
    stderr: "stderr details",
    stdout: "stdout details"
  }));
  assert.equal(summary.message, "boom");
  assert.equal(summary.stderr, "stderr details");
  assert.equal(summary.stdout, "stdout details");
});

test("render engine recommendation prefers LibreOffice only when available", () => {
  const result = recommend({
    libreOffice: { available: true }
  });
  assert.match(result.summary, /LibreOffice headless/);
  assert.match(result.batchPath, /OpenXML editable PPTX/);
});

test("render engine recommendation asks for LibreOffice before broad batch when no renderer is available", () => {
  const result = recommend({
    libreOffice: { available: false }
  });
  assert.match(result.summary, /Install or provide LibreOffice/);
  assert.match(result.batchPath, /dry-run inventory/);
});

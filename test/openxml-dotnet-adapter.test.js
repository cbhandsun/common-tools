"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildBatchArgs,
  buildOpenXmlDecks,
  cleanupOpenXmlBuildArtifacts,
  createOpenXmlBuildArtifacts,
  createOpenXmlBuilderArgs,
  ensureElementIds,
  isBuildArtifactStale,
  normalizeBuildJobs,
  normalizeBatchConcurrency,
  prepareNativeCharts,
  safeOpenXmlName,
  sanitizeOpenXmlIr,
  validateImageAssets,
  resolveOpenXmlBuilderCommand,
  resolveOpenXmlBuilderWorkingDirectory,
  sourceFilesForBuildFreshness
} = require("../skills/pd-hifi-slideclone/scripts/adapters/pptx-openxml-dotnet");
const {
  createOpenXmlBuildCacheIdentity,
  readOpenXmlBuildCache,
  writeOpenXmlBuildCache
} = require("../skills/pd-hifi-slideclone/scripts/lib/openxml-build-cache");
const { writeStoredZipAtomic } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");
const nativeBuilderFileName = process.platform === "win32" ? "OpenXmlDeckBuilder.exe" : "OpenXmlDeckBuilder";

test("OpenXML adapter prefers an explicitly configured builder executable", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-builder-command-"));
  const exe = path.join(tmp, "custom-builder.exe");
  fs.writeFileSync(exe, "");

  const command = resolveOpenXmlBuilderCommand({
    skillRoot: tmp,
    config: { openXmlBuilder: { exePath: exe } }
  }, tmp);

  assert.deepEqual(command, { command: exe, args: [] });
});

test("OpenXML adapter runs a published builder when its source project is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-published-builder-"));
  const binaryDir = path.join(root, "published");
  const missingProjectDir = path.join(root, "source-not-in-runtime-image");
  fs.mkdirSync(binaryDir);
  const exe = path.join(binaryDir, nativeBuilderFileName);
  fs.writeFileSync(exe, "published builder");

  assert.equal(resolveOpenXmlBuilderWorkingDirectory({ command: exe, args: [] }, missingProjectDir), binaryDir);
  assert.throws(() => resolveOpenXmlBuilderWorkingDirectory({ command: "dotnet", args: [] }, missingProjectDir), /working directory is unavailable/);
});

test("OpenXML adapter uses the prebuilt executable before dotnet run", () => {
  const projectDir = makeProjectWithBinary(nativeBuilderFileName);

  const command = resolveOpenXmlBuilderCommand({ skillRoot: projectDir, config: {} }, projectDir);

  assert.equal(command.command, path.join(projectDir, "bin", "Debug", "net8.0", nativeBuilderFileName));
  assert.deepEqual(command.args, []);
});

test("OpenXML adapter ignores stale prebuilt executables when source changed", () => {
  const projectDir = makeProjectWithBinary(nativeBuilderFileName);
  const exe = path.join(projectDir, "bin", "Debug", "net8.0", nativeBuilderFileName);
  const programFile = path.join(projectDir, "Program.cs");
  fs.writeFileSync(programFile, "newer source");
  const stale = new Date(Date.now() - 60_000);
  const fresh = new Date();
  fs.utimesSync(exe, stale, stale);
  fs.utimesSync(programFile, fresh, fresh);

  assert.equal(isBuildArtifactStale(exe, projectDir), true);
  assert.deepEqual(sourceFilesForBuildFreshness(projectDir).map((file) => path.basename(file)), [
    "Program.cs"
  ]);
  const command = resolveOpenXmlBuilderCommand({ skillRoot: projectDir, config: {} }, projectDir);

  assert.equal(command.command, "dotnet");
  assert.deepEqual(command.args, [
    "run",
    "--project",
    path.join(projectDir, "OpenXmlDeckBuilder.csproj"),
    "--"
  ]);
});

test("OpenXML adapter freshness tracks every top-level C# source after writer decomposition", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-builder-sources-"));
  for (const name of ["Program.cs", "Models.cs", "CommandLineOptions.cs", "DeckBatchBuilder.cs", "OpenXmlDeckBuilder.csproj"]) {
    fs.writeFileSync(path.join(projectDir, name), name);
  }
  fs.mkdirSync(path.join(projectDir, "obj"));
  fs.writeFileSync(path.join(projectDir, "obj", "Generated.cs"), "generated");
  assert.deepEqual(sourceFilesForBuildFreshness(projectDir).map((file) => path.basename(file)), [
    "CommandLineOptions.cs",
    "DeckBatchBuilder.cs",
    "Models.cs",
    "OpenXmlDeckBuilder.csproj",
    "Program.cs"
  ]);
});

test("OpenXML adapter falls back to a prebuilt dll when no executable exists", () => {
  const projectDir = makeProjectWithBinary("OpenXmlDeckBuilder.dll");

  const command = resolveOpenXmlBuilderCommand({ skillRoot: projectDir, config: {} }, projectDir);

  assert.equal(command.command, "dotnet");
  assert.deepEqual(command.args, [path.join(projectDir, "bin", "Debug", "net8.0", "OpenXmlDeckBuilder.dll")]);
});

test("OpenXML adapter preserves dotnet run fallback when no build artifact exists", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-builder-command-"));

  const command = resolveOpenXmlBuilderCommand({ skillRoot: projectDir, config: {} }, projectDir);

  assert.equal(command.command, "dotnet");
  assert.deepEqual(command.args, [
    "run",
    "--project",
    path.join(projectDir, "OpenXmlDeckBuilder.csproj"),
    "--"
  ]);
});

test("OpenXML adapter validates batch build jobs at the boundary", () => {
  assert.throws(() => normalizeBuildJobs([]), /requires at least one job/);
  assert.throws(() => normalizeBuildJobs([{ irFile: "deck.json" }]), /requires irFile and outFile/);
  assert.throws(
    () => normalizeBuildJobs([{ irFile: "deck.json", outFile: "deck.pptx", templatePptx: "missing-template.pptx" }]),
    /template PPTX was not found/
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-template-"));
  const templatePptx = path.join(tmp, "template.pptx");
  fs.writeFileSync(templatePptx, "PK mock template");
  const jobs = normalizeBuildJobs([{ irFile: "deck.json", outFile: "deck.pptx", templatePptx }]);
  assert.equal(jobs.length, 1);
  assert.equal(path.isAbsolute(jobs[0].irFile), true);
  assert.equal(path.isAbsolute(jobs[0].outFile), true);
  assert.equal(jobs[0].templatePptx, templatePptx);
});

test("OpenXML adapter writes a batch manifest for multi-deck generation", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-template-batch-"));
  const templatePptx = path.join(tmp, "template.pptx");
  fs.writeFileSync(templatePptx, "PK mock template");
  const jobs = normalizeBuildJobs([
    { irFile: "a.json", outFile: "a.pptx", templatePptx },
    { irFile: "b.json", outFile: "b.pptx" }
  ]);

  const artifacts = { files: [], directories: [] };
  try {
    const args = buildBatchArgs(jobs, artifacts);
    assert.equal(args[0], "--batch");
    const manifest = JSON.parse(fs.readFileSync(args[1], "utf8"));
    assert.equal(manifest.jobs.length, 2);
    assert.equal(manifest.jobs[0].ir, jobs[0].irFile);
    assert.equal(manifest.jobs[0].templatePptx, templatePptx);
    assert.equal(manifest.jobs[1].out, jobs[1].outFile);
  } finally {
    cleanupOpenXmlBuildArtifacts(artifacts);
  }
  assert.equal(artifacts.files.some((file) => fs.existsSync(file)), false);
  assert.equal(artifacts.directories.some((directory) => fs.existsSync(directory)), false);
});

test("OpenXML adapter validates and forwards an explicit bounded batch concurrency", () => {
  assert.equal(normalizeBatchConcurrency(undefined), null);
  assert.equal(normalizeBatchConcurrency("4"), 4);
  assert.throws(() => normalizeBatchConcurrency(0), /between 1 and 8/);
  assert.throws(() => normalizeBatchConcurrency(9), /between 1 and 8/);
  const artifacts = { files: [], directories: [] };
  try {
    const args = buildBatchArgs([
      { irFile: "a.json", outFile: "a.pptx", templatePptx: "" },
      { irFile: "b.json", outFile: "b.pptx", templatePptx: "" }
    ], artifacts, { concurrency: 4 });
    assert.equal(JSON.parse(fs.readFileSync(args[1], "utf8")).concurrency, 4);
  } finally {
    cleanupOpenXmlBuildArtifacts(artifacts);
  }
});

test("OpenXML adapter isolates safe IR files and cleans every temporary artifact", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-safe-workspace-"));
  const irFile = path.join(tmp, "deck.json");
  const outFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({ pages: [] }), "utf8");

  const first = createOpenXmlBuildArtifacts([{ irFile, outFile, templatePptx: "" }]);
  const second = createOpenXmlBuildArtifacts([{ irFile, outFile, templatePptx: "" }]);
  try {
    assert.notEqual(first.safeJobs[0].irFile, second.safeJobs[0].irFile);
    assert.equal(fs.existsSync(first.safeJobs[0].irFile), true);
    assert.equal(fs.existsSync(second.safeJobs[0].irFile), true);
    assert.deepEqual(createOpenXmlBuilderArgs(first.safeJobs, first), [
      "--ir",
      first.safeJobs[0].irFile,
      "--out",
      outFile
    ]);
  } finally {
    cleanupOpenXmlBuildArtifacts(first);
    cleanupOpenXmlBuildArtifacts(second);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(first.files.some((file) => fs.existsSync(file)), false);
  assert.equal(second.files.some((file) => fs.existsSync(file)), false);
});

test("OpenXML adapter cleans safe IR after a builder failure", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-builder-failure-"));
  const irFile = path.join(tmp, "deck.json");
  const outFile = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({ pages: [] }), "utf8");

  await assert.rejects(
    buildOpenXmlDecks([{ irFile, outFile }], {
      skillRoot: tmp,
      configFile: path.join(tmp, "slideclone.config.json"),
      config: { openXmlBuilder: { exePath: process.execPath } }
    }, tmp)
  );

  assert.deepEqual(fs.readdirSync(tmp).filter((name) => name.startsWith(".openxml-safe-")), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("OpenXML adapter sanitizes empty drawing ids before handing IR to the builder", () => {
  const ir = {
    pages: [{
      shapes: [{ id: "" }, { id: "  valid-shape  " }],
      images: [{ id: null }],
      tables: [{ id: "\u0000bad" }],
      textBoxes: [{ text: "missing id" }, { id: "  " }],
      charts: [{ id: "" }]
    }]
  };

  sanitizeOpenXmlIr(ir, "sample");

  assert.deepEqual(ir.pages[0].shapes.map((item) => item.id), ["sample-p1-shape-1", "valid-shape"]);
  assert.equal(ir.pages[0].images[0].id, "sample-p1-image-1");
  assert.equal(ir.pages[0].tables[0].id, "_bad");
  assert.deepEqual(ir.pages[0].textBoxes.map((item) => item.id), ["sample-p1-text-1", "sample-p1-text-2"]);
  assert.equal(ir.pages[0].charts[0].id, "sample-p1-chart-1");
});

test("OpenXML adapter promotes chart data to a hash-bound native ChartPart payload", () => {
  const ir = { pages: [{ charts: [{ id: "chart-1", type: "bar", categories: ["A", "B"], values: [1, 2], style: { barFill: "#2F80ED" } }] }] };
  prepareNativeCharts(ir);
  assert.equal(ir.pages[0].charts[0].nativePayload.dataVerified, true);
  assert.match(ir.pages[0].charts[0].nativePayload.fallbackSha256, /^[a-f0-9]{64}$/);
  ir.pages[0].charts[0].values[0] = 99;
  assert.throws(() => prepareNativeCharts(ir), /stale/);
});

test("OpenXML adapter validates image assets before starting the builder", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-image-assets-"));
  fs.mkdirSync(path.join(tmp, "assets"));
  fs.writeFileSync(path.join(tmp, "assets", "valid.png"), "png");
  const ir = {
    pages: [{
      images: [
        { id: "valid-image", assetPath: "assets/valid.png" },
        { id: "missing-image", assetPath: "assets/missing.png" }
      ]
    }]
  };

  assert.throws(
    () => validateImageAssets(ir, tmp),
    /1 missing image asset\(s\).*page 1 image missing-image: assets[\\/]missing\.png/
  );
  ir.pages[0].images.pop();
  assert.deepEqual(validateImageAssets(ir, tmp), { checked: 1 });
});

test("OpenXML adapter rejects malformed image asset paths at the boundary", () => {
  const ir = { pages: [{ images: [{ id: "bad-image", assetPath: "" }] }] };

  assert.throws(
    () => validateImageAssets(ir, os.tmpdir()),
    /invalid image asset paths: page 1 image bad-image/
  );
});

test("OpenXML adapter keeps drawing names non-empty and control-character safe", () => {
  assert.equal(safeOpenXmlName("  alpha  "), "alpha");
  assert.equal(safeOpenXmlName("a\u0001b"), "a_b");
  assert.equal(safeOpenXmlName(null), "");

  const items = [{ id: "" }, { id: "ok" }];
  ensureElementIds(items, "prefix");
  assert.deepEqual(items.map((item) => item.id), ["prefix-1", "ok"]);
});

test("OpenXML build cache is content-addressed, portable, and refuses corrupt entries", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-build-cache-"));
  const projectDir = path.join(tmp, "builder");
  const sourceDir = path.join(tmp, "source");
  const cacheDir = path.join(tmp, "cache");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "Program.cs"), "v1", "utf8");
  const asset = path.join(sourceDir, "asset.png");
  fs.writeFileSync(asset, "pixels-v1");
  const irFile = path.join(sourceDir, "deck.json");
  fs.writeFileSync(irFile, JSON.stringify({ pages: [{ images: [{ assetPath: "asset.png" }] }] }), "utf8");
  const builder = { command: "dotnet", args: ["run"] };
  const key = createOpenXmlBuildCacheIdentity({ irFile, templatePptx: "" }, builder, projectDir);
  const pptx = path.join(tmp, "built.pptx");
  writeStoredZipAtomic(pptx, [
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/presentation.xml", data: Buffer.from("<p:presentation/>") }
  ]);
  writeOpenXmlBuildCache(cacheDir, key, pptx);
  const restored = path.join(tmp, "other", "restored.pptx");
  assert.equal(readOpenXmlBuildCache(cacheDir, key, restored).hit, true);
  assert.deepEqual(fs.readFileSync(restored), fs.readFileSync(pptx));

  fs.writeFileSync(asset, "pixels-v2");
  assert.notEqual(createOpenXmlBuildCacheIdentity({ irFile, templatePptx: "" }, builder, projectDir), key);
  fs.writeFileSync(path.join(cacheDir, key.slice(0, 2), key, "deck.pptx"), "corrupt");
  assert.equal(readOpenXmlBuildCache(cacheDir, key, restored), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeProjectWithBinary(fileName) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-builder-command-"));
  const binaryDir = path.join(projectDir, "bin", "Debug", "net8.0");
  fs.mkdirSync(binaryDir, { recursive: true });
  fs.writeFileSync(path.join(binaryDir, fileName), "");
  return projectDir;
}

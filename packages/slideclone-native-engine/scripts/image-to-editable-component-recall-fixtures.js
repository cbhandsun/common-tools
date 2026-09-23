"use strict";

const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createEditableJob, runEditableJob } = require("../../../packages/slideclone-core");
const { writePng } = require("../../../packages/slideclone-core/png");
const {
  DEFAULT_MANIFEST,
  buildImageToEditableComponentRecallCorpusPlan
} = require("./image-to-editable-component-recall-corpus");

const DEFAULT_ROOT = path.join("runs", "image-to-editable-component-recall");
const DEFAULT_OUT = path.join(DEFAULT_ROOT, "fixture-materialization-report.json");
const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });
const SLIDECLONE_TIMEOUT_MS = 30 * 60 * 1000;
const SOURCE_WIDTH = 960;
const SOURCE_HEIGHT = 540;
const FAMILY_LABELS = Object.freeze({
  "cycle-loop": "cycle",
  "fishbone-cause": "fishbone",
  "funnel-flow": "funnel",
  "hierarchy-tree": "hierarchy",
  "layered-architecture": "layers",
  "matrix-table": "matrix",
  "overlap-diagram": "overlap",
  "process-flow": "process",
  "pyramid-stack": "pyramid",
  "relationship-network": "network",
  "specialty-chart": "chart",
  "timeline-roadmap": "timeline"
});

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    root: DEFAULT_ROOT,
    out: DEFAULT_OUT,
    stateRoot: path.join(DEFAULT_ROOT, ".state"),
    ownerId: "image-recall-fixture",
    force: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      args.manifest = next;
      index += 1;
    } else if (arg === "--root" && next) {
      args.root = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--state-root" && next) {
      args.stateRoot = next;
      index += 1;
    } else if (arg === "--owner-id" && next) {
      args.ownerId = next;
      index += 1;
    } else if (arg === "--force") {
      args.force = true;
    } else {
      throw new Error(`Unknown image-to-editable-component-recall-fixtures argument: ${arg}`);
    }
  }
  return args;
}

async function materializeImageToEditableComponentRecallFixtures(options = {}) {
  const manifest = options.manifest || DEFAULT_MANIFEST;
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const out = path.resolve(options.out || DEFAULT_OUT);
  const stateRoot = path.resolve(options.stateRoot || path.join(root, ".state"));
  const ownerId = safeOwnerId(options.ownerId || "image-recall-fixture");
  const force = options.force === true;
  const executeSlideclone = typeof options.executeSlideclone === "function"
    ? options.executeSlideclone
    : createLocalSlidecloneRunner();
  const plan = buildImageToEditableComponentRecallCorpusPlan({ manifest });
  fs.mkdirSync(path.join(root, "sources"), { recursive: true });
  fs.mkdirSync(stateRoot, { recursive: true });
  const results = [];
  for (const entry of plan.cases) {
    if (entry.source.kind !== "image") throw new Error(`corpus case ${entry.id} fixture source kind must be image`);
    const sourceFile = path.resolve(entry.source.path);
    const caseRoot = path.resolve(entry.artifacts.inputWorkDir);
    assertInside(path.resolve(process.cwd()), sourceFile, "source path");
    assertInside(path.resolve(process.cwd()), caseRoot, "case work directory");
    if (fs.existsSync(caseRoot)) {
      if (!force) throw new Error(`corpus case ${entry.id} already exists; pass --force to refresh`);
      fs.rmSync(caseRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, renderCaseSourcePng(entry));
    fs.mkdirSync(caseRoot, { recursive: true });
    const stagingInputDir = path.join(caseRoot, "input");
    const stagingInput = path.join(stagingInputDir, path.basename(sourceFile));
    fs.mkdirSync(stagingInputDir, { recursive: true });
    fs.copyFileSync(sourceFile, stagingInput);
    const configFile = path.join(caseRoot, "slideclone.config.json");
    writeConfig(configFile, {
      inputDir: stagingInputDir,
      outputDir: caseRoot,
      pagePattern: path.basename(stagingInput),
      sourceComponents: entry.source.components
    });
    const job = createEditableJob({
      workspaceRoot: process.cwd(),
      stateRoot,
      ownerId,
      input: stagingInput,
      output: caseRoot,
      config: configFile,
      idempotencyKey: `image-recall-fixture:${entry.id}:${hashFile(sourceFile)}`
    });
    const completed = runEditableJob({ stateRoot, ownerId, id: job.id, executeSlideclone });
    if (completed.status !== "succeeded" || completed.quality?.passed !== true) {
      throw new Error(`corpus case ${entry.id} image-to-editable job failed`);
    }
    const sourceIr = path.join(caseRoot, "ir", "deck.json");
    const sourcePptx = path.join(caseRoot, "pptx", "deck.pptx");
    const outputPptx = path.resolve(entry.artifacts.outputPptx);
    assertRegularFile(sourceIr, `corpus case ${entry.id} generated IR`);
    assertRegularFile(sourcePptx, `corpus case ${entry.id} generated PPTX`);
    fs.mkdirSync(path.dirname(outputPptx), { recursive: true });
    fs.copyFileSync(sourcePptx, outputPptx);
    const deck = readJson(sourceIr);
    assertMeasuredComponentAnalysis(deck, entry, sourceFile);
    fs.writeFileSync(path.resolve(entry.artifacts.outputIr), `${JSON.stringify(deck, null, 2)}\n`, "utf8");
    const result = {
      id: entry.id,
      source: sourceFile,
      inputWorkDir: caseRoot,
      outputIr: path.resolve(entry.artifacts.outputIr),
      outputPptx,
      expectedComponentFamilies: entry.expectedComponentFamilies,
      jobId: completed.id,
      quality: completed.quality
    };
    if (entry.artifacts.componentCandidateReport) {
      const candidateReport = componentCandidateReport(entry);
      const componentCandidateReportFile = path.resolve(entry.artifacts.componentCandidateReport);
      fs.writeFileSync(componentCandidateReportFile, `${JSON.stringify(candidateReport, null, 2)}\n`, "utf8");
      result.componentCandidateReport = componentCandidateReportFile;
    }
    results.push(result);
  }
  const report = {
    provider: "image-to-editable-component-recall-fixtures-v1",
    generatedAt: new Date().toISOString(),
    manifest: path.resolve(manifest),
    root,
    summary: {
      caseCount: results.length,
      sourceImages: results.length,
      outputPptx: results.length,
      outputIr: results.length,
      componentCandidateReports: results.filter((entry) => entry.componentCandidateReport).length,
      componentFamilyTypes: new Set(results.flatMap((entry) => entry.expectedComponentFamilies)).size
    },
    results
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function createLocalSlidecloneRunner({ spawn = childProcess.spawnSync } = {}) {
  if (typeof spawn !== "function") throw new TypeError("slideclone process adapter must be a function");
  const script = path.join(__dirname, "slideclone.js");
  assertRegularFile(script, "local slideclone entry point");
  const componentAssetRoot = resolveDefaultComponentAssetRoot();
  return function executeLocalSlideclone(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("slideclone execution request is invalid");
    const configPath = boundedAbsoluteFile(request.configPath, "configPath");
    const inputPath = boundedAbsoluteFile(request.inputPath, "inputPath");
    const inputPaths = request.inputPaths === undefined ? [inputPath] : request.inputPaths;
    if (!Array.isArray(inputPaths) || inputPaths.length < 1 || inputPaths.length > 20 || inputPaths[0] !== request.inputPath || inputPaths.some((file) => typeof file !== "string")) {
      throw new TypeError("slideclone inputPaths must be a bounded ordered file list");
    }
    const approvedInputs = inputPaths.map((file) => boundedAbsoluteFile(file, "inputPaths"));
    if (new Set(approvedInputs).size !== approvedInputs.length || approvedInputs[0] !== inputPath) throw new TypeError("slideclone inputPaths must be a unique ordered file list");
    const inputArguments = approvedInputs.flatMap((file) => ["--input-file", file]);
    const env = { ...process.env };
    if (!env.COMMON_TOOLS_IMAGE_COMPONENT_ASSET_ROOT && componentAssetRoot) {
      env.COMMON_TOOLS_IMAGE_COMPONENT_ASSET_ROOT = componentAssetRoot;
    }
    return spawn(process.execPath, [script, "run", "--config", configPath, ...inputArguments], {
      encoding: "utf8",
      env,
      windowsHide: true,
      timeout: SLIDECLONE_TIMEOUT_MS
    });
  };
}

function resolveDefaultComponentAssetRoot({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd, "runs", "plugin-component-inventory");
  if (!fs.existsSync(path.join(root, "asset-registry.json"))) return "";
  if (!fs.existsSync(path.join(root, "assets", "sha256"))) return "";
  return root;
}

function assertMeasuredComponentAnalysis(deck, entry, sourceFile) {
  if (!deck || typeof deck !== "object" || !Array.isArray(deck.pages) || deck.pages.length < 1) {
    throw new Error(`corpus case ${entry.id} generated IR is invalid`);
  }
  const sourceSha256 = hashFile(sourceFile);
  const observed = new Set();
  for (const page of deck.pages) {
    const evidence = page?.source?.componentAnalysis;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) continue;
    if (evidence.provider !== "team-component-analysis-v1") continue;
    if (evidence.sourceSha256 && evidence.sourceSha256 !== sourceSha256) throw new Error(`corpus case ${entry.id} component analysis source hash does not match`);
    addFamiliesFromCounts(observed, evidence.detectedComponentFamilyCounts);
    addFamiliesFromCounts(observed, evidence.matchedComponentFamilyCounts);
    addFamiliesFromCounts(observed, evidence.strategyComponentFamilyCounts);
    addFamiliesFromRows(observed, evidence.componentFamilies);
  }
  const missing = entry.expectedComponentFamilies.filter((family) => !observed.has(family));
  if (missing.length > 0) {
    throw new Error(`corpus case ${entry.id} generated IR is missing measured componentAnalysis families: ${missing.join(", ")}`);
  }
}

function addFamiliesFromCounts(target, counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return;
  for (const [family, count] of Object.entries(counts)) {
    if (Number(count) > 0) target.add(family);
  }
}

function addFamiliesFromRows(target, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const family = String(row?.family || "");
    if (family) target.add(family);
  }
}

function componentCandidateReport(entry) {
  return {
    provider: "image-to-editable-component-recall-fixture-candidates-v1",
    caseId: entry.id,
    layers: entry.source.components.map((component, index) => ({
      pageIndex: 0,
      imageIndex: 0,
      layerType: "diagram",
      detector: "image-to-editable-recall-fixture",
      templateFamily: component.family,
      targetMotifs: [motifForFamily(component.family)],
      componentRenderStrategy: {
        mode: "native-rebuild-with-component-style-guide",
        applicationPlan: {
          componentKind: FAMILY_LABELS[component.family] || component.family,
          targetMotifs: [motifForFamily(component.family)]
        }
      },
      componentFamilyEvidence: {
        family: component.family,
        ordinal: index + 1
      }
    }))
  };
}

function motifForFamily(family) {
  return ({
    "cycle-loop": "arc-arrow",
    "fishbone-cause": "fishbone-cause",
    "funnel-flow": "funnel-stack",
    "hierarchy-tree": "tree-link",
    "layered-architecture": "layered-stack",
    "matrix-table": "comparison-matrix",
    "overlap-diagram": "venn-overlap",
    "process-flow": "linear-arrow-chain",
    "pyramid-stack": "pyramid-stack",
    "relationship-network": "topology-network",
    "specialty-chart": "donut-segment-chart",
    "timeline-roadmap": "milestone-roadmap"
  })[family] || family;
}

function writeConfig(file, { inputDir, outputDir, pagePattern, sourceComponents = [] }) {
  const config = {
    inputDir,
    outputDir,
    pagePattern,
    slide: DEFAULT_SLIDE,
    adapters: {
      normalize: "scripts/adapters/normalize-placeholder.js",
      ocr: "scripts/adapters/ocr-placeholder.js",
      vision: "scripts/adapters/vision-component-recall-fixture.js",
      pptx: "scripts/adapters/pptx-openxml-dotnet.js",
      render: "scripts/adapters/render-placeholder.js",
      diff: "scripts/adapters/diff-placeholder.js",
      compare: "scripts/adapters/compare-placeholder.js",
      polish: "scripts/adapters/polish-placeholder.js",
      compress: "scripts/adapters/compress-placeholder.js"
    },
    thresholds: {
      pixelDiffRatio: 0.08,
      layoutMeanIoU: 0.86,
      textCoverage: 0.95,
      maxCriticalOffsetPt: 8,
      maxOutOfBoundsPt: 1,
      maxImageAspectRatioDelta: 0.03,
      maxRasterImageAreaRatio: 0.25
    },
    openXmlBuilder: {
      configuration: "Release",
      targetFramework: "net8.0-windows",
      powerPointSafe: false
    },
    postprocess: {
      compare: false,
      polish: false,
      compress: false
    },
    componentRecallFixture: {
      sourceComponents
    }
  };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function renderCaseSourcePng(entry) {
  const image = blankImage(SOURCE_WIDTH, SOURCE_HEIGHT, 245, 248, 252, 255);
  const palette = [
    [37, 99, 235, 255],
    [22, 163, 74, 255],
    [217, 119, 6, 255],
    [147, 51, 234, 255],
    [14, 116, 144, 255]
  ];
  drawRect(image, 48, 42, 864, 456, [255, 255, 255, 255]);
  drawBorder(image, 48, 42, 864, 456, [71, 85, 105, 255]);
  entry.source.components.forEach((component, index) => {
    const color = palette[index % palette.length];
    const x = 110 + index * 330;
    drawFamilyGlyph(image, component.family, x, 120 + index * 95, color);
  });
  drawFooterBars(image, entry.source.components.length);
  return pngBuffer(image);
}

function drawFamilyGlyph(image, family, x, y, color) {
  if (family === "cycle-loop") {
    drawCircle(image, x + 80, y + 65, 58, color);
    drawCircle(image, x + 80, y + 65, 32, [255, 255, 255, 255]);
    drawTriangle(image, x + 126, y + 35, x + 160, y + 42, x + 134, y + 66, color);
  } else if (family === "fishbone-cause") {
    drawLine(image, x, y + 80, x + 190, y + 40, color, 8);
    for (let i = 0; i < 4; i += 1) {
      drawLine(image, x + 35 + i * 35, y + 72 - i * 7, x + 20 + i * 35, y + 30, color, 5);
      drawLine(image, x + 35 + i * 35, y + 72 - i * 7, x + 50 + i * 35, y + 110, color, 5);
    }
  } else if (family === "funnel-flow") {
    drawRect(image, x, y, 170, 30, color);
    drawRect(image, x + 25, y + 42, 120, 30, color);
    drawRect(image, x + 55, y + 84, 62, 30, color);
  } else if (family === "hierarchy-tree") {
    drawRect(image, x + 60, y, 70, 36, color);
    for (let i = 0; i < 3; i += 1) drawRect(image, x + i * 70, y + 90, 58, 34, color);
    drawLine(image, x + 95, y + 36, x + 95, y + 70, color, 4);
    drawLine(image, x + 29, y + 70, x + 169, y + 70, color, 4);
    for (let i = 0; i < 3; i += 1) drawLine(image, x + 29 + i * 70, y + 70, x + 29 + i * 70, y + 90, color, 4);
  } else if (family === "layered-architecture") {
    for (let i = 0; i < 4; i += 1) drawRect(image, x + i * 18, y + i * 28, 150, 24, color);
  } else if (family === "matrix-table") {
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 4; col += 1) drawBorder(image, x + col * 42, y + row * 34, 40, 32, color);
  } else if (family === "overlap-diagram") {
    drawCircle(image, x + 65, y + 62, 56, [...color.slice(0, 3), 180]);
    drawCircle(image, x + 120, y + 62, 56, [14, 165, 233, 180]);
  } else if (family === "process-flow") {
    for (let i = 0; i < 3; i += 1) {
      drawRect(image, x + i * 70, y + 35, 46, 46, color);
      if (i < 2) drawLine(image, x + i * 70 + 46, y + 58, x + i * 70 + 68, y + 58, color, 5);
    }
  } else if (family === "pyramid-stack") {
    drawTriangle(image, x + 95, y, x, y + 130, x + 190, y + 130, color);
    drawLine(image, x + 35, y + 84, x + 155, y + 84, [255, 255, 255, 255], 5);
    drawLine(image, x + 60, y + 50, x + 130, y + 50, [255, 255, 255, 255], 5);
  } else if (family === "relationship-network") {
    const nodes = [[x + 35, y + 35], [x + 140, y + 30], [x + 85, y + 95], [x + 175, y + 110]];
    for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) drawLine(image, nodes[i][0], nodes[i][1], nodes[j][0], nodes[j][1], [148, 163, 184, 255], 3);
    for (const node of nodes) drawCircle(image, node[0], node[1], 18, color);
  } else if (family === "specialty-chart") {
    drawCircle(image, x + 85, y + 65, 62, color);
    drawCircle(image, x + 85, y + 65, 28, [255, 255, 255, 255]);
    drawRect(image, x + 160, y + 15, 16, 95, [14, 165, 233, 255]);
  } else if (family === "timeline-roadmap") {
    drawLine(image, x, y + 70, x + 190, y + 70, color, 6);
    for (let i = 0; i < 4; i += 1) drawCircle(image, x + i * 58, y + 70, 14, color);
  }
}

function drawFooterBars(image, count) {
  for (let index = 0; index < count; index += 1) drawRect(image, 120 + index * 115, 450, 80, 12, [100, 116, 139, 255]);
}

function blankImage(width, height, r, g, b, a) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = a;
  }
  return { width, height, rgba };
}

function pngBuffer(image) {
  const tmp = path.join(process.cwd(), "runs", ".tmp-image-recall-source.png");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  writePng(tmp, image);
  const buffer = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  return buffer;
}

function drawRect(image, x, y, w, h, color) {
  const left = clamp(Math.round(x), 0, image.width);
  const top = clamp(Math.round(y), 0, image.height);
  const right = clamp(Math.round(x + w), 0, image.width);
  const bottom = clamp(Math.round(y + h), 0, image.height);
  for (let yy = top; yy < bottom; yy += 1) for (let xx = left; xx < right; xx += 1) setPixel(image, xx, yy, color);
}

function drawBorder(image, x, y, w, h, color) {
  drawRect(image, x, y, w, 3, color);
  drawRect(image, x, y + h - 3, w, 3, color);
  drawRect(image, x, y, 3, h, color);
  drawRect(image, x + w - 3, y, 3, h, color);
}

function drawCircle(image, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(image, x, y, color);
    }
  }
}

function drawTriangle(image, x1, y1, x2, y2, x3, y3, color) {
  const minX = Math.floor(Math.min(x1, x2, x3));
  const maxX = Math.ceil(Math.max(x1, x2, x3));
  const minY = Math.floor(Math.min(y1, y2, y3));
  const maxY = Math.ceil(Math.max(y1, y2, y3));
  const area = edge(x1, y1, x2, y2, x3, y3);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w1 = edge(x2, y2, x3, y3, x, y);
      const w2 = edge(x3, y3, x1, y1, x, y);
      const w3 = edge(x1, y1, x2, y2, x, y);
      if ((area >= 0 && w1 >= 0 && w2 >= 0 && w3 >= 0) || (area < 0 && w1 <= 0 && w2 <= 0 && w3 <= 0)) setPixel(image, x, y, color);
    }
  }
}

function drawLine(image, x1, y1, x2, y2, color, width) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    drawCircle(image, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, Math.max(1, width / 2), color);
  }
}

function edge(x1, y1, x2, y2, x, y) {
  return (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
}

function setPixel(image, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return;
  const offset = (py * image.width + px) * 4;
  const alpha = color[3] / 255;
  image.rgba[offset] = Math.round(color[0] * alpha + image.rgba[offset] * (1 - alpha));
  image.rgba[offset + 1] = Math.round(color[1] * alpha + image.rgba[offset + 1] * (1 - alpha));
  image.rgba[offset + 2] = Math.round(color[2] * alpha + image.rgba[offset + 2] * (1 - alpha));
  image.rgba[offset + 3] = 255;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function assertInside(root, target, label) {
  const relative = path.relative(root, path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the workspace`);
}

function assertRegularFile(file, label) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 1) throw new Error(`${label} is unavailable`);
}

function boundedAbsoluteFile(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096 || !path.isAbsolute(value)) {
    throw new TypeError(`slideclone ${label} must be a bounded absolute path`);
  }
  const resolved = path.resolve(value);
  const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new TypeError(`slideclone ${label} must identify a file`);
  return fs.realpathSync.native(resolved);
}

function safeOwnerId(value) {
  const text = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/u.test(text)) throw new Error("owner id is invalid");
  return text;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await materializeImageToEditableComponentRecallFixtures(args);
  process.stdout.write(`caseCount: ${report.summary.caseCount}\n`);
  process.stdout.write(`componentFamilyTypes: ${report.summary.componentFamilyTypes}\n`);
  process.stdout.write(`report: ${path.resolve(args.out)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_OUT,
  DEFAULT_ROOT,
  materializeImageToEditableComponentRecallFixtures,
  parseArgs,
  _private: {
    assertMeasuredComponentAnalysis,
    componentCandidateReport,
    createLocalSlidecloneRunner,
    motifForFamily,
    resolveDefaultComponentAssetRoot,
    renderCaseSourcePng
  }
};

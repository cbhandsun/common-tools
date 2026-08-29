"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const cli = path.resolve(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
const { editableProfileConfig, initializeEditableProfile } = require("../packages/cli/bin/common-tools");
const { renderedDeliveryVerification, verifyDelivery } = require("../skills/pd-hifi-slideclone/scripts/slideclone");

test("editable init writes a non-overwriting PaddleOCR text-overlay profile without embedding runtime paths", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-init-"));
  try {
    const input = path.join(workspace, "source.png");
    fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), input);
    const result = initializeEditableProfile(
      { workspaceRoot: workspace },
      { input, out: path.join(workspace, "output") },
      { paddleOcr: { available: true } }
    );
    assert.equal(result.profile, "editable-text-overlay-v1");
    assert.equal(result.ocrProvider, "paddleocr-local");
    const config = JSON.parse(fs.readFileSync(result.config, "utf8"));
    assert.equal(config.inputDir, workspace);
    assert.equal(config.outputDir, path.join(workspace, "output"));
    assert.equal(config.adapters.normalize, "scripts/adapters/normalize-cli.js");
    assert.equal(config.adapters.ocr, "scripts/adapters/ocr-paddleocr-local.js");
    assert.equal(config.adapters.vision, "scripts/adapters/vision-editable-overlay.js");
    assert.equal(config.postprocess.compare, false);
    assert.match(config.paddleOcr.cacheDir, /paddleocr-local/);
    assert.equal(JSON.stringify(config).includes("PaddleOCR-json.exe"), false);
    assert.throws(() => initializeEditableProfile(
      { workspaceRoot: workspace },
      { input, out: path.join(workspace, "output") },
      { paddleOcr: { available: true } }
    ), /EEXIST/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("verified text-overlay profile enables PowerPoint render and bounded quality comparison", () => {
  const config = editableProfileConfig("C:\\workspace\\source.png", "C:\\workspace\\output", "umi-paddle", { verifyRender: true });
  assert.equal(config.adapters.render, "scripts/adapters/render-powerpoint-com.js");
  assert.equal(config.adapters.diff, "scripts/adapters/diff-pixel-png.js");
  assert.equal(config.postprocess.compare, true);
  assert.equal(config.postprocess.compress, false);
  assert.equal(config.textOcr.enabled, true);
  assert.equal(config.textOcr.mode, "fullPage");
  assert.match(config.umiOcr.cacheDir, /ocr-cache/);
});

test("editable init refuses render verification for a non-PNG input before it writes configuration", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-init-verify-type-"));
  try {
    const input = path.join(workspace, "source.jpg");
    fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), input);
    assert.throws(() => initializeEditableProfile(
      { workspaceRoot: workspace },
      { input, out: path.join(workspace, "output"), "verify-render": true },
      { umiOcr: { available: true } }
    ), /requires a PNG input/);
    assert.deepEqual(fs.readdirSync(workspace), ["source.jpg"]);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("delivery verification accepts only non-placeholder prior renders with every rendered page", async () => {
  assert.equal(renderedDeliveryVerification({ provider: "render-placeholder", renderedPages: [{ image: "page.png" }] }), null);
  assert.equal(renderedDeliveryVerification({ provider: "render-powerpoint-com", renderedPages: [] }), null);
  const priorRender = { provider: "render-powerpoint-com", renderDir: "render", renderedPages: [{ pageIndex: 0, image: "page.png" }] };
  assert.deepEqual(renderedDeliveryVerification(priorRender), priorRender);
  const delivery = await verifyDelivery({
    postprocess: {},
    context: {},
    render: async () => { throw new Error("prior render should be reused"); },
    ir: {},
    pptx: { pptxFile: "deck.pptx" },
    compress: { skipped: true },
    priorRender
  });
  assert.equal(delivery.verified, true);
  assert.equal(delivery.verification.provider, "render-powerpoint-com");
});

test("CLI editable run creates and returns a bounded failed local Job when its runner rejects a configured adapter", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-cli-editable-run-"));
  try {
    const input = path.join(workspace, "input.png");
    const config = path.join(workspace, "slideclone.config.json");
    fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), input);
    fs.writeFileSync(config, JSON.stringify({ inputDir: workspace, outputDir: path.join(workspace, "output"), adapters: { ocr: "scripts/adapters/does-not-exist.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    const result = spawnSync(process.execPath, [cli, "editable", "run", "--workspace", workspace, "--state", path.join(workspace, "state"), "--input", input, "--out", path.join(workspace, "output"), "--config", config], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const job = JSON.parse(result.stdout);
    assert.equal(job.status, "failed");
    assert.equal(job.error.code, "SLIDECLONE_FAILED");
    assert.equal(job.error.message.includes(input), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("CLI editable batch admits an ordered local image list and keeps adapter failures bounded", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-cli-editable-batch-"));
  try {
    const fixture = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png");
    const first = path.join(workspace, "first.png"); const second = path.join(workspace, "second.png"); const output = path.join(workspace, "output"); const config = path.join(workspace, "slideclone.config.json");
    fs.copyFileSync(fixture, first); fs.copyFileSync(fixture, second);
    fs.writeFileSync(config, JSON.stringify({ inputDir: workspace, outputDir: output, adapters: { ocr: "scripts/adapters/does-not-exist.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    const result = spawnSync(process.execPath, [cli, "editable", "batch", "--workspace", workspace, "--state", path.join(workspace, "state"), "--inputs", "second.png,first.png", "--out", output, "--config", config], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr); const job = JSON.parse(result.stdout);
    assert.equal(job.status, "failed"); assert.deepEqual(job.input.paths.map((item) => path.basename(item)), ["second.png", "first.png"]); assert.equal(job.error.message.includes(workspace), false);
    const rejected = spawnSync(process.execPath, [cli, "editable", "batch", "--workspace", workspace, "--inputs", "first.png,first.png", "--out", path.join(workspace, "other"), "--config", config], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /unique/);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test("CLI editable commands reject a malformed image before creating state", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-cli-editable-image-invalid-"));
  try {
    const input = path.join(workspace, "input.png");
    const config = path.join(workspace, "slideclone.config.json");
    fs.writeFileSync(input, "not an image", "utf8");
    fs.writeFileSync(config, JSON.stringify({ inputDir: workspace, outputDir: path.join(workspace, "output"), adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    const result = spawnSync(process.execPath, [cli, "editable", "create", "--workspace", workspace, "--state", path.join(workspace, "state"), "--input", input, "--out", path.join(workspace, "output"), "--config", config], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /input must be a bounded PNG or JPEG image/);
    assert.equal(fs.existsSync(path.join(workspace, "state")), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("CLI editable commands reject a missing provider config before creating state", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-cli-editable-config-required-"));
  try {
    const input = path.join(workspace, "input.png");
    fs.writeFileSync(input, "not an image", "utf8");
    const result = spawnSync(process.execPath, [cli, "editable", "create", "--workspace", workspace, "--state", path.join(workspace, "state"), "--input", input, "--out", path.join(workspace, "output")], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires --input, --out, and --config/);
    assert.equal(fs.existsSync(path.join(workspace, "state")), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writePng } = require("../packages/slideclone-core/png");
const {
  parsePageIndex,
  resolvePath,
  runHeadlessQualityCommand,
  runRethemeCommand,
  runTemplateCommand
} = require("../packages/cli/declarative-cli");

function makePng(color) {
  const rgba = Buffer.alloc(8 * 8 * 4);
  for (let i = 0; i < 64; i += 1) {
    const offset = i * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return { width: 8, height: 8, rgba };
}

function captureStdout(callback) {
  let output = "";
  const origWrite = process.stdout.write;
  process.stdout.write = (chunk) => { output += chunk; return true; };
  try {
    const code = callback();
    return { code, output };
  } finally {
    process.stdout.write = origWrite;
  }
}

test("runTemplateCommand lists, shows, exports and imports templates", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-template-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir, stateRoot: tmpDir };

    // list
    let result = captureStdout(() => runTemplateCommand(ctx, "list"));
    assert.equal(result.code, 0);
    const list = JSON.parse(result.output);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 3);

    // show
    result = captureStdout(() => runTemplateCommand(ctx, "show", { id: "builtin-kpi-card-v1" }));
    assert.equal(result.code, 0);
    const tpl = JSON.parse(result.output);
    assert.equal(tpl.id, "builtin-kpi-card-v1");

    // export to file
    const exportFile = path.join(tmpDir, "exported-templates.json");
    const exportCode = runTemplateCommand(ctx, "export", { out: exportFile });
    assert.equal(exportCode, 0);
    assert.ok(fs.existsSync(exportFile));

    // import from file
    result = captureStdout(() => runTemplateCommand(ctx, "import", { file: exportFile }));
    assert.equal(result.code, 0);
    const res = JSON.parse(result.output);
    assert.equal(res.status, "imported");
    assert.equal(res.count, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, "templates", "components", "builtin-kpi-card-v1.json")), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runTemplateCommand imports only new templates into persistent storage", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-template-import-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir, stateRoot: tmpDir };
    const bundleFile = path.join(tmpDir, "custom-bundle.json");
    fs.writeFileSync(bundleFile, JSON.stringify([{
      id: "custom-template-v1",
      archetype: "custom_card",
      category: "custom",
      envelope: { w: 100, h: 60 },
      shapes: [{ id: "bg", type: "rectangle", relX: 0, relY: 0, relW: 1, relH: 1 }],
      slots: [{ name: "title", role: "title", defaultText: "[title]", relX: 0.1, relY: 0.1, relW: 0.8, relH: 0.3 }],
      palette: { fills: [], strokes: [] },
      tags: []
    }]), "utf8");

    const result = captureStdout(() => runTemplateCommand(ctx, "import", { file: bundleFile }));
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.output).count, 1);
    assert.equal(fs.existsSync(path.join(tmpDir, "templates", "components", "custom-template-v1.json")), true);
    assert.equal(fs.existsSync(path.join(tmpDir, "templates", "components", "builtin-kpi-card-v1.json")), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runTemplateCommand updates existing persistent custom templates on import", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-template-update-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir, stateRoot: tmpDir };
    const bundleFile = path.join(tmpDir, "custom-bundle.json");
    const template = {
      id: "custom-template-v1",
      archetype: "custom_card",
      category: "custom",
      envelope: { w: 100, h: 60 },
      shapes: [{ id: "bg", type: "rectangle", relX: 0, relY: 0, relW: 1, relH: 1 }],
      slots: [{ name: "title", role: "title", defaultText: "before", relX: 0.1, relY: 0.1, relW: 0.8, relH: 0.3 }],
      palette: { fills: [], strokes: [] },
      tags: []
    };

    fs.writeFileSync(bundleFile, JSON.stringify([template]), "utf8");
    assert.equal(captureStdout(() => runTemplateCommand(ctx, "import", { file: bundleFile })).code, 0);

    const updated = { ...template, slots: [{ ...template.slots[0], defaultText: "after" }] };
    fs.writeFileSync(bundleFile, JSON.stringify([updated]), "utf8");
    const result = captureStdout(() => runTemplateCommand(ctx, "import", { file: bundleFile }));
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.output).count, 0);

    const stored = JSON.parse(fs.readFileSync(path.join(tmpDir, "templates", "components", "custom-template-v1.json"), "utf8"));
    assert.equal(stored.slots[0].defaultText, "after");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runTemplateCommand keeps built-in-only imports out of persistent storage", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-template-builtin-import-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir, stateRoot: tmpDir };
    const exportFile = path.join(tmpDir, "exported-templates.json");
    assert.equal(runTemplateCommand(ctx, "export", { out: exportFile }), 0);

    const result = captureStdout(() => runTemplateCommand(ctx, "import", { file: exportFile }));
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.output).count, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, "templates", "components", "builtin-kpi-card-v1.json")), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("declarative CLI paths must remain inside the workspace", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-path-boundary-"));
  const outside = path.join(os.tmpdir(), `outside-${Date.now()}.json`);
  try {
    assert.throws(() => resolvePath(tmpDir, "..\\outside.json", "input file"), /inside the workspace root/);
    assert.throws(() => resolvePath(tmpDir, outside, "input file"), /inside the workspace root/);
    assert.throws(() => resolvePath(tmpDir, tmpDir, "output file"), /inside the workspace root/);
    assert.throws(() => runTemplateCommand({ workspaceRoot: tmpDir, stateRoot: tmpDir }, "export", { out: outside }), /inside the workspace root/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test("parsePageIndex rejects invalid page values", () => {
  assert.equal(parsePageIndex(undefined), 0);
  assert.equal(parsePageIndex("2"), 2);
  assert.throws(() => parsePageIndex("-1"), /non-negative integer/);
  assert.throws(() => parsePageIndex("1.5"), /non-negative integer/);
  assert.throws(() => parsePageIndex("bad"), /non-negative integer/);
});

test("runHeadlessQualityCommand executes headless quality check", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-quality-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir };
    const slideFile = path.join(tmpDir, "slide.json");
    fs.writeFileSync(slideFile, JSON.stringify({
      shapes: [{ x: 10, y: 10, w: 100, h: 50 }],
      textBoxes: [{ text: "测试", box: { x: 15, y: 15, w: 90, h: 30 }, font: { sizePt: 12 } }]
    }), "utf8");

    const outFile = path.join(tmpDir, "quality-report.json");
    const result = captureStdout(() => runHeadlessQualityCommand(ctx, { input: slideFile, out: outFile }));
    assert.equal(result.code, 0);
    assert.ok(fs.existsSync(outFile));
    const report = JSON.parse(result.output);
    assert.equal(report.passed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runHeadlessQualityCommand executes perceptual PNG checks when render images are provided", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-quality-image-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir };
    const slideFile = path.join(tmpDir, "slide.json");
    fs.writeFileSync(slideFile, JSON.stringify({
      shapes: [{ x: 10, y: 10, w: 100, h: 50 }],
      textBoxes: []
    }), "utf8");

    const referenceFile = path.join(tmpDir, "reference.png");
    const renderedFile = path.join(tmpDir, "rendered.png");
    writePng(referenceFile, makePng([20, 40, 60]));
    writePng(renderedFile, makePng([20, 40, 60]));

    const result = captureStdout(() => runHeadlessQualityCommand(ctx, {
      input: slideFile,
      "reference-png": referenceFile,
      "rendered-png": renderedFile,
      "min-ssim": "1",
      "max-phash-distance": "0"
    }));

    assert.equal(result.code, 0);
    const report = JSON.parse(result.output);
    assert.equal(report.metrics["perceptual-ssim"], 1);
    assert.equal(report.metrics["perceptual-phash-distance"], 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("declarative CLI reports invalid JSON without echoing input content", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-json-boundary-"));
  try {
    const badFile = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badFile, "{\"token\":\"private-token\"", "utf8");
    assert.throws(() => runHeadlessQualityCommand({ workspaceRoot: tmpDir }, { input: badFile }), (error) => {
      assert.match(error.message, /input file must contain valid JSON/);
      assert.equal(error.message.includes("private-token"), false);
      return true;
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("declarative CLI rejects empty, oversized, and non-file JSON inputs", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-json-file-boundary-"));
  try {
    const emptyFile = path.join(tmpDir, "empty.json");
    const largeFile = path.join(tmpDir, "large.json");
    const directoryInput = path.join(tmpDir, "bundle-dir");
    fs.writeFileSync(emptyFile, "", "utf8");
    fs.writeFileSync(largeFile, `${" ".repeat(8 * 1024 * 1024)}[]`, "utf8");
    fs.mkdirSync(directoryInput);

    assert.throws(() => runHeadlessQualityCommand({ workspaceRoot: tmpDir }, { input: emptyFile }), /input file must not be empty/);
    assert.throws(() => runHeadlessQualityCommand({ workspaceRoot: tmpDir }, { input: largeFile }), /input file exceeds the maximum JSON size/);
    assert.throws(() => runTemplateCommand({ workspaceRoot: tmpDir, stateRoot: tmpDir }, "import", { file: directoryInput }), /template bundle file must be a regular file/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runRethemeCommand re-themes deck using brand kit", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-retheme-test-"));
  try {
    const ctx = { workspaceRoot: tmpDir };
    const slideFile = path.join(tmpDir, "slide.json");
    fs.writeFileSync(slideFile, JSON.stringify({
      shapes: [{ type: "rectangle", fill: "#0000FF" }],
      textBoxes: [{ text: "换肤标题", role: "title", font: { sizePt: 16 } }]
    }), "utf8");

    const brandFile = path.join(tmpDir, "brand.json");
    fs.writeFileSync(brandFile, JSON.stringify({
      palette: {
        primary: "#C0392B", secondary: "#2C3E50", accent: "#27AE60",
        background: "#ECF0F1", surface: "#FFFFFF", textPrimary: "#2C3E50", textMuted: "#7F8C8D"
      },
      typography: { headingFont: "Source Han Sans", bodyFont: "Source Han Sans" }
    }), "utf8");

    const outFile = path.join(tmpDir, "rethemed.json");
    const code = runRethemeCommand(ctx, { input: slideFile, "brand-kit": brandFile, out: outFile });
    assert.equal(code, 0);
    assert.ok(fs.existsSync(outFile));

    const rethemed = JSON.parse(fs.readFileSync(outFile, "utf8"));
    assert.equal(rethemed.textBoxes[0].font.fontFamily, "Source Han Sans");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runRethemeCommand rejects invalid brand kit without echoing private content", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-retheme-brand-boundary-"));
  try {
    const ctx = { workspaceRoot: tmpDir };
    const slideFile = path.join(tmpDir, "slide.json");
    fs.writeFileSync(slideFile, JSON.stringify({
      shapes: [{ type: "rectangle", fill: "#0000FF" }],
      textBoxes: []
    }), "utf8");

    const brandFile = path.join(tmpDir, "brand.json");
    fs.writeFileSync(brandFile, JSON.stringify({
      palette: {
        primary: "#12G",
        secondary: "#2C3E50",
        accent: "#27AE60",
        background: "#ECF0F1",
        surface: "#FFFFFF",
        textPrimary: "#2C3E50",
        textMuted: "#7F8C8D"
      },
      typography: { headingFont: "Source Han Sans private-token", bodyFont: "Source Han Sans" }
    }), "utf8");

    const outFile = path.join(tmpDir, "rethemed.json");
    assert.throws(() => runRethemeCommand(ctx, { input: slideFile, "brand-kit": brandFile, out: outFile }), (error) => {
      assert.match(error.message, /brand kit\.palette\.primary must be a #RGB or #RRGGBB hex color/);
      assert.equal(error.message.includes("private-token"), false);
      return true;
    });
    assert.equal(fs.existsSync(outFile), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

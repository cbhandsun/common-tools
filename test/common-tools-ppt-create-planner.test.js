"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { parsePresentationBrief, persistPresentationPlan, planPresentation, validatePresentationBrief } = require("../packages/ppt-create-core/planner");
const { setCapabilityEnabled } = require("../packages/capability-runtime");

function brief() {
  return { version: "1.0", title: "年度经营规划", audience: "经营委员会", purpose: "形成下一年度优先级共识", theme: "clean-light-v1", maxSlides: 8, sections: [
    { id: "context", title: "当前判断", points: Array.from({ length: 7 }, (_, index) => ({ id: `fact-${index + 1}`, label: `关键事实 ${index + 1}`, detail: "已验证的业务背景" })) },
    { id: "metrics", title: "目标指标", mode: "metrics", points: [{ id: "growth", label: "收入增长", value: "20%" }, { id: "margin", label: "毛利率", value: "45%" }] },
    { id: "path", title: "推进路径", mode: "process", points: [{ id: "pilot", label: "试点" }, { id: "scale", label: "复制" }] }
  ], closing: ["确认年度优先级", "明确首季度负责人"] };
}

test("brief planner preserves all points and produces a valid bounded narrative", () => {
  const first = planPresentation(brief()); const second = planPresentation(brief());
  assert.deepEqual(first, second);
  assert.equal(first.report.passed, true);
  assert.equal(first.report.sourcePoints, 11);
  assert.equal(first.spec.slides.length, 6);
  assert.deepEqual(first.spec.slides.map((slide) => slide.role), ["cover", "content", "content", "metrics", "process", "closing"]);
  assert.equal(first.spec.slides.slice(1, -1).reduce((total, slide) => total + slide.items.length, 0), 11);
});

test("brief validation rejects unknown, placeholder, duplicate, incompatible, excessive, and malformed input", () => {
  assert.throws(() => validatePresentationBrief({ ...brief(), unknown: true }), /unsupported fields/);
  assert.throws(() => validatePresentationBrief({ ...brief(), purpose: "TODO" }), /invalid/);
  const duplicate = brief(); duplicate.sections[1].id = "context"; assert.throws(() => validatePresentationBrief(duplicate), /section ids must be unique/);
  const metrics = brief(); metrics.sections[1].points[0].value = undefined; assert.throws(() => validatePresentationBrief(metrics), /valued points/);
  const invalidId = brief(); invalidId.sections[0].points[0].id = ""; assert.throws(() => validatePresentationBrief(invalidId), /id is invalid/);
  const invalidRequired = brief(); invalidRequired.sections[0].points[0].required = "yes"; assert.throws(() => validatePresentationBrief(invalidRequired), /must be a boolean/);
  const small = brief(); small.maxSlides = 2; assert.throws(() => planPresentation(small), /requires at least 6 slides/);
  assert.throws(() => parsePresentationBrief(Buffer.from("{")), /invalid JSON/);
  assert.throws(() => parsePresentationBrief(Buffer.alloc(2 * 1024 * 1024 + 1)), /file size/);
});

test("planner persists only a new workspace-contained JSON spec", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plan-test-"));
  try {
    const input = path.join(root, "brief.json"); const output = path.join(root, "presentation.json");
    fs.writeFileSync(input, JSON.stringify(brief()));
    const result = persistPresentationPlan({ workspaceRoot: root, input, output });
    assert.equal(result.report.passed, true);
    assert.equal(JSON.parse(fs.readFileSync(output)).slides.length, 6);
    assert.throws(() => persistPresentationPlan({ workspaceRoot: root, input, output }), /new JSON file/);
    assert.throws(() => persistPresentationPlan({ workspaceRoot: root, input, output: path.join(root, "..", "outside.json") }), /outside the approved root/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("CLI exposes brief planning as a guarded local command", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plan-cli-test-"));
  try {
    const state = path.join(root, "state"); const input = path.join(root, "brief.json"); const output = path.join(root, "presentation.json");
    fs.writeFileSync(input, JSON.stringify(brief())); setCapabilityEnabled(state, "ppt-create", true);
    const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
    const result = spawnSync(process.execPath, [cli, "ppt", "plan", "--workspace", root, "--state", state, "--input", input, "--out", output], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).report.slideCount, 6); assert.equal(fs.existsSync(output), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
